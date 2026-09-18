// Sprint 10B:混合检索的共用件(总开关、查询词 embedding 缓存、语义候选去重与阈值、搜索配额)
//
// 不变量(SPRINT_10_SEARCH 全 sprint):SEARCH_AI_ENABLED=false 或 embedding key 缺失 → 语义层整体不存在,
// 关键词搜索照常;AI 侧任何错误降级为"没有补充结果"。

import type { NextRequest } from 'next/server';
import { embed, isEmbedConfigured } from '@/lib/llm';
import { checkQuota, getVisitorId, isBotUA, type QuotaDb } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils';
import { prisma } from '@/lib/prisma';
import type { NearestHit } from './vectorStore';

export function isSearchAiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SEARCH_AI_ENABLED === 'true' && isEmbedConfigured();
}

/**
 * 余弦相似度阈值,低于它的语义候选丢弃。env 可调。
 * 默认 0.40:2026-09-18 上线后用真实 text-embedding-3-small 实测,相关结果在 0.42 以上,
 * 0.35–0.40 基本是噪音(搜「书桌」带出「手工刻刀板」0.40、搜「自行车」带出「不锈钢带轮衣架」0.352)。spec 的初值是 0.35。
 */
export function semanticMinSim(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.SEARCH_SEMANTIC_MIN_SIM);
  return Number.isFinite(v) && v > -1 && v < 1 ? v : 0.4;
}

// ---------- 查询词 embedding 缓存(同一查询词 10 分钟内不重复付费) ----------

export const QUERY_CACHE_TTL_MS = 10 * 60e3;
const QUERY_CACHE_MAX = 500;

interface CacheEntry { vector: number[]; at: number }

/** 查询词 embedding 的请求超时:搜索是同步等待的,不能像回填那样等 30s × 重试 */
export const QUERY_EMBED_TIMEOUT_MS = 8_000;

export class QueryEmbeddingCache {
  private map = new Map<string, CacheEntry>();
  /** 进行中的请求按 key 合并:同词并发只付一次费(Codex 互审 #6) */
  private inflight = new Map<string, Promise<number[]>>();
  hits = 0;
  misses = 0;

  constructor(
    private embedFn: (text: string) => Promise<number[]> = (t) => embed(t, { timeoutMs: QUERY_EMBED_TIMEOUT_MS }),
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
    const pending = this.inflight.get(key);
    if (pending) { this.hits++; return pending; }
    this.misses++;
    const p = this.embedFn(key).then(vector => {
      // 过期条目刷新时先删再写,LRU 位置才会更新(互审 #8)
      this.map.delete(key);
      this.map.set(key, { vector, at: this.now() });
      if (this.map.size > QUERY_CACHE_MAX) {
        const oldest = this.map.keys().next().value;
        if (oldest !== undefined) this.map.delete(oldest);
      }
      return vector;
    }).finally(() => { this.inflight.delete(key); });
    this.inflight.set(key, p);
    return p;
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

export const SEARCH_LIMITS = {
  visitorPerHour: 60,
  /** 轮换 cookie 就能绕过 visitor 配额,叠一层 IP 配额(校园 NAT 给余量;互审 #2) */
  ipPerHour: 300,
} as const;
const HOUR = 3600e3;

export type SearchGate =
  | { ok: true; visitorId: string; isNew: boolean }
  | { ok: false; reason: 'bot' | 'limited'; retryAfterSec: number; visitorId?: string; isNew?: boolean };

/**
 * 语义路的门:bot UA 直接不给;同 visitor 60 次 / 小时(含按钮触发)。
 * 只砍语义路,关键词层不经过这里。
 */
export async function gateSemanticSearch(
  req: NextRequest,
  db: QuotaDb = prisma as unknown as QuotaDb,
  now: () => number = Date.now,
): Promise<SearchGate> {
  if (isBotUA(req, 'full')) return { ok: false, reason: 'bot', retryAfterSec: 0 };
  const { visitorId, isNew } = getVisitorId(req);
  const ip = getClientIp(req);
  // 先严后宽;被拒的尝试也计入(rateLimit.ts 语义)
  const checks = [
    { key: `search:vid:${visitorId}:h`, windowMs: HOUR, max: SEARCH_LIMITS.visitorPerHour },
    { key: `search:ip:${ip}:h`, windowMs: HOUR, max: SEARCH_LIMITS.ipPerHour },
  ];
  let retryAfterSec = 0;
  let limited = false;
  const fullButAdmitted: typeof checks = [];
  for (const c of checks) {
    const r = await checkQuota(c, db, now);
    if (!r.ok) { limited = true; retryAfterSec = Math.max(retryAfterSec, r.retryAfterSec); }
    else if (r.remaining === 0) fullButAdmitted.push(c);
  }
  if (!limited) return { ok: true, visitorId, isNew };
  // 整体被拒时,本次刚好占满的另一桶下次也会拒:retryAfter 取两桶里最晚的(二轮 #4)。只读,不再写计数
  for (const c of fullButAdmitted) {
    const t = now();
    const [oldest] = await db.rateLimitHit.findMany({
      where: { key: c.key, createdAt: { gt: new Date(t - c.windowMs) } },
      orderBy: { createdAt: 'asc' }, skip: 0, take: 1, select: { createdAt: true },
    });
    if (oldest) retryAfterSec = Math.max(retryAfterSec, Math.max(1, Math.ceil((oldest.createdAt.getTime() + c.windowMs - t) / 1000)));
  }
  return { ok: false, reason: 'limited', retryAfterSec, visitorId, isNew };
}
