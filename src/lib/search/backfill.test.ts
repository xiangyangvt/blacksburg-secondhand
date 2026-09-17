import { describe, it, expect } from 'vitest';
import { backfillEmbeddings, type BackfillDeps, type PendingRow } from './backfill';
import type { VectorStore } from './vectorStore';
import { EMBED_DIM } from '@/lib/llm';

/** 内存"库":embeddedAt 为 null 的行是待回填;upsert 后置为非 null */
function world(counts: { item?: number; listing?: number; event?: number }) {
  const rows = new Map<string, { kind: string; embedded: boolean }>();
  for (const [kind, n] of Object.entries(counts)) for (let i = 0; i < n; i++) rows.set(`${kind}-${i}`, { kind, embedded: false });
  let apiCalls = 0;
  const upserts: string[] = [];
  const indexed: string[] = [];
  const store: VectorStore = {
    backend: 'json',
    async upsert(_k, id) { rows.get(id)!.embedded = true; upserts.push(id); },
    async remove() {},
    async nearest() { return []; },
    async ensureIndex(k) { indexed.push(k); },
  };
  let clock = 0;
  const deps: BackfillDeps = {
    fetchPending: async (kind, take) =>
      [...rows.entries()].filter(([, r]) => r.kind === kind && !r.embedded).slice(0, take).map(([id]): PendingRow => ({ id, text: `t:${id}` })),
    embedMany: async (texts) => { apiCalls++; return texts.map(() => new Array(EMBED_DIM).fill(0.2)); },
    store: () => store,
    sleep: async () => {},
    now: () => clock,
  };
  return { deps, rows, upserts, indexed, api: () => apiCalls, tick: (ms: number) => { clock += ms; } };
}

describe('backfillEmbeddings', () => {
  it('分批(≤50)遍历三种类型,全部回填;第二次运行 0 次 API 调用(幂等)', async () => {
    const w = world({ item: 120, listing: 7, event: 0 });
    const r1 = await backfillEmbeddings({ deps: w.deps });
    expect(r1.embedded).toBe(127);
    expect(r1.done).toBe(true);
    // item 120 条 = 3 批(50/50/20),listing 1 批,event 0 批
    expect(r1.perKind.map(k => k.apiCalls)).toEqual([3, 1, 0]);
    expect(r1.apiCalls).toBe(4);
    expect([...w.rows.values()].every(r => r.embedded)).toBe(true);
    // 建索引只在这条路径,每种类型一次
    expect(w.indexed).toEqual(['item', 'listing', 'event']);

    const before = w.api();
    const r2 = await backfillEmbeddings({ deps: w.deps });
    expect(w.api() - before).toBe(0);
    expect(r2.embedded).toBe(0);
    expect(r2.done).toBe(true);
  });

  it('maxBatches 限制单次运行量,done=false,可续跑', async () => {
    const w = world({ item: 130 });
    const r1 = await backfillEmbeddings({ deps: w.deps, kinds: ['item'], maxBatches: 2 });
    expect(r1.embedded).toBe(100);
    expect(r1.done).toBe(false);
    const r2 = await backfillEmbeddings({ deps: w.deps, kinds: ['item'], maxBatches: 2 });
    expect(r2.embedded).toBe(30);
    expect(r2.done).toBe(true);
  });

  it('deadlineMs:到期在批边界停下,done=false,续跑补齐', async () => {
    const w = world({ item: 120, listing: 3 });
    // 每次 embed 推进 400ms,截止 1000ms → item 跑 3 批中的前 3 批?第 3 批开始前已 800ms 未到期,第 3 批后 1200ms 到期,listing 整个跳过
    const deps = { ...w.deps, embedMany: async (t: string[]) => { w.tick(400); return w.deps.embedMany(t); } };
    const r1 = await backfillEmbeddings({ deps, deadlineMs: 1000 });
    expect(r1.perKind[0]!.embedded).toBe(120);
    expect(r1.perKind[1]!.embedded).toBe(0);
    expect(r1.done).toBe(false);
    const r2 = await backfillEmbeddings({ deps: w.deps });
    expect(r2.perKind[1]!.embedded).toBe(3);
    expect(r2.done).toBe(true);
  });

  it('batchSize 上限 50', async () => {
    const w = world({ item: 60 });
    const seen: number[] = [];
    const deps = { ...w.deps, embedMany: async (t: string[]) => { seen.push(t.length); return t.map(() => new Array(EMBED_DIM).fill(0)); } };
    await backfillEmbeddings({ deps, kinds: ['item'], batchSize: 500 });
    expect(seen).toEqual([50, 10]);
  });

  it('embed 连续失败两次 → 放弃该类型,不死循环,继续下一类型', async () => {
    const w = world({ item: 5, listing: 3 });
    let itemFails = 0;
    const logs: string[] = [];
    const deps: BackfillDeps = {
      ...w.deps,
      embedMany: async (texts) => {
        if (texts[0]!.startsWith('t:item')) { itemFails++; throw new Error('boom'); }
        return texts.map(() => new Array(EMBED_DIM).fill(0));
      },
    };
    const r = await backfillEmbeddings({ deps, log: m => logs.push(m) });
    expect(itemFails).toBe(2);
    expect(r.perKind[0]).toMatchObject({ kind: 'item', embedded: 0, failed: 5, drained: false });
    expect(r.perKind[1]).toMatchObject({ kind: 'listing', embedded: 3, drained: true });
    expect(r.done).toBe(false);
    expect(logs.some(l => l.includes('boom'))).toBe(true);
  });

  it('单条写入失败不阻塞其余,但 drained / done 必须为 false(失败行仍待回填),再跑能补齐', async () => {
    const w = world({ item: 3 });
    let failOnce = true;
    const store: VectorStore = {
      ...w.deps.store(),
      async upsert(_k, id) {
        if (id === 'item-1' && failOnce) { failOnce = false; throw new Error('write fail'); }
        w.rows.get(id)!.embedded = true;
      },
    };
    const r = await backfillEmbeddings({ deps: { ...w.deps, store: () => store }, kinds: ['item'] });
    expect(r.perKind[0]).toMatchObject({ embedded: 2, failed: 1, drained: false });
    expect(r.done).toBe(false);
    const r2 = await backfillEmbeddings({ deps: { ...w.deps, store: () => store }, kinds: ['item'] });
    expect(r2.perKind[0]).toMatchObject({ embedded: 1, failed: 0, drained: true });
    expect(r2.done).toBe(true);
  });
});
