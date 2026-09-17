// Sprint 10A:写入时 embedding(异步、失败不影响发布)
//
// 三处 POST / PATCH 在写库成功后调 scheduleEmbed(kind, id);删除 / 下架调 scheduleRemove。
// `after` 语义:fire-and-forget,任何失败只记一行日志,embeddedAt 留空等回填脚本补。
// 只有实质性字段(标题 / 描述 / 类目 / 标签 / 地点)变化才重算,改价格 / 联系方式不重算(needsReembed)。

import { prisma } from '@/lib/prisma';
import { embed, isEmbedConfigured } from '@/lib/llm';
import {
  type EmbedKind, embedTextFor,
  ITEM_EMBED_SELECT, LISTING_EMBED_SELECT, EVENT_EMBED_SELECT,
} from './embedText';
import { getVectorStore, type VectorStore } from './vectorStore';

export const ITEM_SUBSTANTIVE    = ['title', 'description', 'category', 'customTag', 'type'] as const;
export const LISTING_SUBSTANTIVE = ['title', 'description', 'type', 'areas', 'budgetMin', 'budgetMax', 'hasPlace', 'housingLayout', 'furnished', 'moveInFuzzy'] as const;
export const EVENT_SUBSTANTIVE   = ['title', 'description', 'location', 'category', 'customCategory', 'startAt'] as const;

const SUBSTANTIVE: Record<EmbedKind, readonly string[]> = {
  item: ITEM_SUBSTANTIVE,
  listing: LISTING_SUBSTANTIVE,
  event: EVENT_SUBSTANTIVE,
};

/** PATCH 的 updates 对象里是否有会改变 embedding 文本的字段(值为 undefined 视为未传) */
export function needsReembed(kind: EmbedKind, updates: Record<string, unknown>): boolean {
  return SUBSTANTIVE[kind].some(k => updates[k] !== undefined);
}

export type EmbedOutcome = 'ok' | 'skipped' | 'failed';

export interface IndexerDeps {
  loadText: (kind: EmbedKind, id: string) => Promise<string | null>;
  embed: (text: string) => Promise<number[]>;
  store: () => VectorStore;
  configured: () => boolean;
  log: (msg: string) => void;
}

/** 按白名单 select 读一行并构造文本;行不存在返回 null */
export async function loadEmbedText(kind: EmbedKind, id: string): Promise<string | null> {
  switch (kind) {
    case 'item': {
      const row = await prisma.item.findUnique({ where: { id }, select: ITEM_EMBED_SELECT });
      return row ? embedTextFor('item', row) : null;
    }
    case 'listing': {
      const row = await prisma.listing.findUnique({ where: { id }, select: LISTING_EMBED_SELECT });
      return row ? embedTextFor('listing', row) : null;
    }
    default: {
      const row = await prisma.event.findUnique({ where: { id }, select: EVENT_EMBED_SELECT });
      return row ? embedTextFor('event', row) : null;
    }
  }
}

const defaultDeps: IndexerDeps = {
  loadText: loadEmbedText,
  embed,
  store: getVectorStore,
  configured: isEmbedConfigured,
  log: (m) => console.warn(m),
};

/** 同步版本:读行 → 构造文本 → embed → upsert。供 scheduleEmbed 与单测用 */
export async function embedOne(kind: EmbedKind, id: string, deps: IndexerDeps = defaultDeps): Promise<EmbedOutcome> {
  if (!deps.configured()) {
    deps.log(`[indexer] LLM_EMBED_API_KEY 未配,跳过 ${kind}:${id}(embeddedAt 留空,配 key 后跑回填)`);
    return 'skipped';
  }
  try {
    const text = await deps.loadText(kind, id);
    if (!text) return 'skipped';
    const vector = await deps.embed(text);
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
