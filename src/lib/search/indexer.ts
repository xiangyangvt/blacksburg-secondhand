// Sprint 10A:写入时 embedding(异步、失败不影响发布)
//
// 三处 POST / PATCH 在写库成功后调 scheduleEmbed(kind, id);删除 / 下架调 scheduleRemove。
// `after` 语义:fire-and-forget,任何失败只记一行日志,embeddedAt 留空等回填脚本补。
// 只有实质性字段(标题 / 描述 / 类目 / 标签 / 地点)**真的变了**才重算(substantiveChanged 比较新旧值;
// 编辑表单提交的是完整字段,只看"字段是否出现"会让每次保存都重算——Codex 互审 #8)。
// 调用方在实质性变更时同一条 update 里把 embeddedAt 置空:这样 embed 失败的行会被回填捞回(互审 #2)。
//
// 乱序防线(互审 #1):embed 是异步的,A→B 两次编辑的结果可能乱序到达,删除后旧请求也可能写回。
// 写入前重新读一次文本与状态:文本变了或状态已不可检索就放弃这次结果;vectorStore.upsert 自身也带 status 守卫。

import { prisma } from '@/lib/prisma';
import { embed, isEmbedConfigured } from '@/lib/llm';
import {
  type EmbedKind, embedTextFor,
  ITEM_EMBED_SELECT, LISTING_EMBED_SELECT, EVENT_EMBED_SELECT,
} from './embedText';
import { getVectorStore, SEARCHABLE_STATUSES, type VectorStore } from './vectorStore';

export const ITEM_SUBSTANTIVE    = ['title', 'description', 'category', 'customTag', 'type'] as const;
export const LISTING_SUBSTANTIVE = ['title', 'description', 'type', 'areas', 'budgetMin', 'budgetMax', 'hasPlace', 'housingLayout', 'furnished', 'moveInFuzzy'] as const;
export const EVENT_SUBSTANTIVE   = ['title', 'description', 'location', 'category', 'customCategory', 'startAt'] as const;

const SUBSTANTIVE: Record<EmbedKind, readonly string[]> = {
  item: ITEM_SUBSTANTIVE,
  listing: LISTING_SUBSTANTIVE,
  event: EVENT_SUBSTANTIVE,
};

/** 值相等:Date 按时间,数组 / 对象按 JSON,null 与 undefined 等价,其余严格相等 */
export function valueEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : NaN;
    const tb = b instanceof Date ? b.getTime() : NaN;
    return ta === tb;
  }
  if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/**
 * PATCH 的规范化后数据(after)相对库里现有行(before),是否有实质性字段真的变了。
 * after 里为 undefined 的键视为未传。
 */
export function substantiveChanged(kind: EmbedKind, before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  return SUBSTANTIVE[kind].some(k => after[k] !== undefined && !valueEq(before[k], after[k]));
}

export type EmbedOutcome = 'ok' | 'skipped' | 'failed';

export interface EmbedSnapshot { text: string; status: string }

export interface IndexerDeps {
  /** 按白名单读一行,返回构造好的文本与状态;行不存在返回 null */
  load: (kind: EmbedKind, id: string) => Promise<EmbedSnapshot | null>;
  embed: (text: string) => Promise<number[]>;
  store: () => VectorStore;
  configured: () => boolean;
  log: (msg: string) => void;
}

export async function loadEmbedSnapshot(kind: EmbedKind, id: string): Promise<EmbedSnapshot | null> {
  switch (kind) {
    case 'item': {
      const row = await prisma.item.findUnique({ where: { id }, select: { ...ITEM_EMBED_SELECT, status: true } });
      return row ? { text: embedTextFor('item', row), status: row.status } : null;
    }
    case 'listing': {
      const row = await prisma.listing.findUnique({ where: { id }, select: { ...LISTING_EMBED_SELECT, status: true } });
      return row ? { text: embedTextFor('listing', row), status: row.status } : null;
    }
    default: {
      const row = await prisma.event.findUnique({ where: { id }, select: { ...EVENT_EMBED_SELECT, status: true } });
      return row ? { text: embedTextFor('event', row), status: row.status } : null;
    }
  }
}

const defaultDeps: IndexerDeps = {
  load: loadEmbedSnapshot,
  embed,
  store: getVectorStore,
  configured: isEmbedConfigured,
  log: (m) => console.warn(m),
};

function searchable(status: string): boolean {
  return (SEARCHABLE_STATUSES as readonly string[]).includes(status);
}

/** 同步版本:读行 → 构造文本 → embed → 复核未变 → upsert。供 scheduleEmbed 与单测用 */
export async function embedOne(kind: EmbedKind, id: string, deps: IndexerDeps = defaultDeps): Promise<EmbedOutcome> {
  if (!deps.configured()) {
    deps.log(`[indexer] LLM_EMBED_API_KEY 未配,跳过 ${kind}:${id}(embeddedAt 留空,配 key 后跑回填)`);
    return 'skipped';
  }
  try {
    const snap = await deps.load(kind, id);
    if (!snap || !searchable(snap.status)) return 'skipped';
    const vector = await deps.embed(snap.text);
    // 乱序防线:embed 期间行被再次编辑 / 删除 → 这次结果作废(新编辑会有自己的一次 embed;删除无需向量)
    const again = await deps.load(kind, id);
    if (!again || !searchable(again.status) || again.text !== snap.text) {
      deps.log(`[indexer] ${kind}:${id} 在 embed 期间被修改或下架,放弃本次结果`);
      return 'skipped';
    }
    await deps.store().upsert(kind, id, vector);
    return 'ok';
  } catch (e) {
    deps.log(`[indexer] embed ${kind}:${id} 失败(留待回填):${(e as Error)?.message ?? e}`);
    return 'failed';
  }
}

/** fire-and-forget。调用方在写库成功后调,不 await */
export function scheduleEmbed(kind: EmbedKind, id: string): void {
  void embedOne(kind, id).catch(() => {});
}

/** 删除 / 下架:清向量。同样不 await */
export function scheduleRemove(kind: EmbedKind, id: string): void {
  void getVectorStore().remove(kind, id).catch((e: unknown) => {
    console.warn(`[indexer] remove ${kind}:${id} 失败:${(e as Error)?.message ?? e}`);
  });
}
