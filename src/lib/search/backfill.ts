// Sprint 10A:回填 embedding(可重复执行、可中断续跑)
//
// 遍历 embeddedAt IS NULL 的 active 行,每批 ≤ 50 条一次 API 调用(embedMany),批间隔 200ms。
// 幂等:写入后 embeddedAt 非空,下一次查询自然跳过;全部回填后再跑 = 0 次 API 调用。
// 一批失败重试一次,再失败就放弃该类型(避免死循环),留给下次。
// 调用方:scripts/backfill-embeddings.ts(本地 / CI)与 POST /api/admin/backfill-embeddings(Railway 上,本地连不到生产库)。

import { prisma } from '@/lib/prisma';
import { embedMany } from '@/lib/llm';
import {
  type EmbedKind, EMBED_KINDS, embedTextFor,
  ITEM_EMBED_SELECT, LISTING_EMBED_SELECT, EVENT_EMBED_SELECT,
} from './embedText';
import { getVectorStore, type VectorStore } from './vectorStore';

export interface BackfillKindResult {
  kind: EmbedKind;
  scanned: number;
  embedded: number;
  failed: number;
  apiCalls: number;
  /** true = 该类型没有剩余待回填行 */
  drained: boolean;
}

export interface BackfillResult {
  perKind: BackfillKindResult[];
  apiCalls: number;
  embedded: number;
  /** 所有类型都 drained */
  done: boolean;
}

export interface BackfillOpts {
  kinds?: readonly EmbedKind[];
  /** 每批条数,≤ 50 */
  batchSize?: number;
  /** 批间隔 ms */
  delayMs?: number;
  /** 每种类型最多跑几批(admin 接口用来控制单次请求时长);不填 = 跑到没有为止 */
  maxBatches?: number;
  /** 整体截止(ms,自调用起算);到期在批边界停下,done=false(互审 #6)。不填 = 不限 */
  deadlineMs?: number;
  log?: (msg: string) => void;
  deps?: Partial<BackfillDeps>;
}

export interface PendingRow { id: string; text: string }

export interface BackfillDeps {
  /** 取一批待回填的行(已构造好文本) */
  fetchPending: (kind: EmbedKind, take: number) => Promise<PendingRow[]>;
  embedMany: (texts: string[]) => Promise<number[][]>;
  store: () => VectorStore;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const PENDING_WHERE = { status: 'active', embeddedAt: null } as const;

export async function fetchPendingRows(kind: EmbedKind, take: number): Promise<PendingRow[]> {
  const args = { where: PENDING_WHERE, orderBy: { id: 'asc' as const }, take };
  switch (kind) {
    case 'item': {
      const rows = await prisma.item.findMany({ ...args, select: ITEM_EMBED_SELECT });
      return rows.map(r => ({ id: r.id, text: embedTextFor('item', r) }));
    }
    case 'listing': {
      const rows = await prisma.listing.findMany({ ...args, select: LISTING_EMBED_SELECT });
      return rows.map(r => ({ id: r.id, text: embedTextFor('listing', r) }));
    }
    default: {
      const rows = await prisma.event.findMany({ ...args, select: EVENT_EMBED_SELECT });
      return rows.map(r => ({ id: r.id, text: embedTextFor('event', r) }));
    }
  }
}

/** 待回填计数(admin GET 预览用) */
export async function countPending(): Promise<Record<EmbedKind, number>> {
  const [item, listing, event] = await Promise.all([
    prisma.item.count({ where: PENDING_WHERE }),
    prisma.listing.count({ where: PENDING_WHERE }),
    prisma.event.count({ where: PENDING_WHERE }),
  ]);
  return { item, listing, event };
}

const defaultDeps: BackfillDeps = {
  fetchPending: fetchPendingRows,
  embedMany,
  store: getVectorStore,
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  now: Date.now,
};

export async function backfillEmbeddings(opts: BackfillOpts = {}): Promise<BackfillResult> {
  const deps: BackfillDeps = { ...defaultDeps, ...opts.deps };
  const kinds = opts.kinds ?? EMBED_KINDS;
  const batchSize = Math.min(Math.max(opts.batchSize ?? 50, 1), 50);
  const delayMs = opts.delayMs ?? 200;
  const log = opts.log ?? (() => {});
  const t0 = deps.now();
  const overdue = () => opts.deadlineMs !== undefined && deps.now() - t0 >= opts.deadlineMs;
  const perKind: BackfillKindResult[] = [];

  for (const kind of kinds) {
    const r: BackfillKindResult = { kind, scanned: 0, embedded: 0, failed: 0, apiCalls: 0, drained: false };
    perKind.push(r);
    if (overdue()) continue;
    // 建索引只在这条路径(不在请求路径);失败只 warn
    const store = deps.store();
    if (store.ensureIndex) await store.ensureIndex(kind);
    let batches = 0;
    // 失败的 id 记下来,下一批查询时排除,避免同一批反复失败卡住
    const failedIds = new Set<string>();

    for (;;) {
      if (opts.maxBatches !== undefined && batches >= opts.maxBatches) break;
      if (overdue()) { log(`[backfill] ${kind} 到达截止时间,停在批边界`); break; }
      const rows = (await deps.fetchPending(kind, batchSize + failedIds.size)).filter(x => !failedIds.has(x.id)).slice(0, batchSize);
      // drained 必须反映真实待回填数:本次跳过的失败行不算完成(互审 #5)
      if (rows.length === 0) { r.drained = failedIds.size === 0; break; }
      batches++;
      r.scanned += rows.length;

      let vectors: number[][] | null = null;
      for (let attempt = 0; attempt < 2 && !vectors; attempt++) {
        try {
          r.apiCalls++;
          vectors = await deps.embedMany(rows.map(x => x.text));
        } catch (e) {
          log(`[backfill] ${kind} 第 ${batches} 批 embed 失败(第 ${attempt + 1} 次):${(e as Error)?.message ?? e}`);
          if (attempt === 0) await deps.sleep(delayMs * 5);
        }
      }
      if (!vectors) {
        r.failed += rows.length;
        log(`[backfill] ${kind} 放弃本次(连续两次失败),已回填 ${r.embedded}`);
        break;
      }

      for (let i = 0; i < rows.length; i++) {
        try {
          await store.upsert(kind, rows[i]!.id, vectors[i]!);
          r.embedded++;
        } catch (e) {
          r.failed++;
          failedIds.add(rows[i]!.id);
          log(`[backfill] ${kind}:${rows[i]!.id} 写入失败:${(e as Error)?.message ?? e}`);
        }
      }
      log(`[backfill] ${kind} 第 ${batches} 批:${rows.length} 条,累计 ${r.embedded}`);
      await deps.sleep(delayMs);
    }
  }

  return {
    perKind,
    apiCalls: perKind.reduce((s, x) => s + x.apiCalls, 0),
    embedded: perKind.reduce((s, x) => s + x.embedded, 0),
    done: perKind.every(x => x.drained && x.failed === 0),
  };
}
