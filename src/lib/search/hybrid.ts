// Sprint 10B:混合检索的共用件(总开关、查询词 embedding 缓存、语义候选去重与阈值、搜索配额)
//
// 不变量(SPRINT_10_SEARCH 全 sprint):SEARCH_AI_ENABLED=false 或 embedding key 缺失 → 语义层整体不存在,
// 关键词搜索照常;AI 侧任何错误降级为"没有补充结果"。

import type { NextRequest } from 'next/server';
import { embed, isEmbedConfigured } from '@/lib/llm';
import { checkQuota, getVisitorId, isBotUA, type QuotaDb } from '@/lib/rateLimit';
import { prisma } from '@/lib/prisma';
import type { NearestHit } from './vectorStore';

export function isSearchAiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SEARCH_AI_ENABLED === 'true' && isEmbedConfigured();
}

/** 余弦相似度阈值,低于它的语义候选丢弃。初值 0.35,env 可调 */
export function semanticMinSim(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.SEARCH_SEMANTIC_MIN_SIM);
  return Number.isFinite(v) && v > -1 && v < 1 ? v : 0.35;
}

// ---------- 查询词 embedding 缓存(同一查询词 10 分钟内不重复付费) ----------

export const QUERY_CACHE_TTL_MS = 10 * 60e3;
const QUERY_CACHE_MAX = 500;

interface CacheEntry { vector: number[]; at: number }

export class QueryEmbeddingCache {
  private map = new Map<string, CacheEntry>();
  hits = 0;
  misses = 0;

  constructor(
    private embedFn: (text: string) => Promise<number[]> = embed,
    private now: () => number = Date.now,
    private ttlMs = QUERY_CACHE_TTL_MS,
  ) {}

  static normalize(q: string): string {
    return q.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  async get(q: string): Promise<number[]> {
    const key = QueryEmbeddingCache.normalize(q);
    const t = this.now();
    const hit = this.map.get(key);
    if (hit && t - hit.at < this.ttlMs) {
      this.hits++;
      // 刷新 LRU 位置
      this.map.delete(key); this.map.set(key, hit);
      return hit.vector;
    }
    this.misses++;
    const vector = await this.embedFn(key);
    this.map.set(key, { vector, at: t });
    if (this.map.size > QUERY_CACHE_MAX) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    return vector;
  }
}

let cacheSingleton: QueryEmbeddingCache | undefined;
export function getQueryEmbeddingCache(): QueryEmbeddingCache {
  return (cacheSingleton ??= new QueryEmbeddingCache());
}

// ---------- 语义候选挑选(纯函数) ----------

export interface SemanticPick { id: string; similarity: number }

/**
 * 从 nearest 命中里去掉关键词层已有的 id,丢掉低于阈值的,最多 max 条;保持相似度降序。
 */
export function pickSemantic(hits: readonly NearestHit[], keywordIds: Iterable<string>, minSim: number, max: number): SemanticPick[] {
  const seen = new Set(keywordIds);
  const out: SemanticPick[] = [];
  for (const h of [...hits].sort((a, b) => b.similarity - a.similarity)) {
    if (out.length >= max) break;
    if (seen.has(h.id)) continue;
    if (!(h.similarity >= minSim)) continue;
    seen.add(h.id);
    out.push({ id: h.id, similarity: h.similarity });
  }
  return out;
}

/** 关键词命中少于这个数才自动触发语义层;否则只给按钮(Sean 拍板 2026-09-17) */
export const AUTO_TRIGGER_BELOW = 5;

export function semanticTrigger(keywordCount: number): 'auto' | 'button' {
  return keywordCount < AUTO_TRIGGER_BELOW ? 'auto' : 'button';
}

// ---------- 搜索配额(走 9C) ----------

export const SEARCH_LIMITS = { visitorPerHour: 60 } as const;
const HOUR = 3600e3;

export type SearchGate =
  | { ok: true; visitorId: string; isNew: boolean }
  | { ok: false; reason: 'bot' | 'limited'; retryAfterSec: number; visitorId?: string; isNew?: boolean };

/**
 * 语义路的门:bot UA 直接不给;同 visitor 60 次 / 小时(含按钮触发)。
 * 只砍语义路,关键词层不经过这里。
 */
export async function gateSemanticSearch(req: NextRequest, db: QuotaDb = prisma as unknown as QuotaDb): Promise<SearchGate> {
  if (isBotUA(req, 'full')) return { ok: false, reason: 'bot', retryAfterSec: 0 };
  const { visitorId, isNew } = getVisitorId(req);
  const r = await checkQuota({ key: `search:vid:${visitorId}:h`, windowMs: HOUR, max: SEARCH_LIMITS.visitorPerHour }, db);
  if (!r.ok) return { ok: false, reason: 'limited', retryAfterSec: r.retryAfterSec, visitorId, isNew };
  return { ok: true, visitorId, isNew };
}
