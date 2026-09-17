import { describe, it, expect } from 'vitest';
import { backfillEmbeddings, type BackfillDeps, type PendingRow } from './backfill';
import type { VectorStore } from './vectorStore';
import { EMBED_DIM } from '@/lib/llm';

/** 内存"库":embeddedAt 为 null 的行是待回填;upsert 后置为非 null */
function world(counts: { item?: number; listing?: number; event?: number }) {
  const rows = new Map<string, { kind: string; embedded: boolean; version: number }>();
  for (const [kind, n] of Object.entries(counts)) for (let i = 0; i < n; i++) rows.set(`${kind}-${i}`, { kind, embedded: false, version: 0 });
  let apiCalls = 0;
  const upserts: string[] = [];
  const indexed: string[] = [];
  const store: VectorStore = {
    backend: 'json',
    async upsert(_k, id, _v, version) {
      const r = rows.get(id)!;
      if (r.version !== version) return false; // 乐观守卫
      r.embedded = true; upserts.push(id); return true;
    },
    async remove() {},
    async nearest() { return []; },
    async ensureIndex(k) { indexed.push(k); },
  };
  let clock = 0;
  const timeouts: (number | undefined)[] = [];
  const deps: BackfillDeps = {
    fetchPending: async (kind, take) =>
      [...rows.entries()].filter(([, r]) => r.kind === kind && !r.embedded).slice(0, take).map(([id, r]): PendingRow => ({ id, text: `t:${id}`, version: r.version })),
    embedMany: async (texts, o) => { apiCalls++; timeouts.push(o?.timeoutMs); return texts.map(() => new Array(EMBED_DIM).fill(0.2)); },
    store: () => store,
    sleep: async () => {},
    now: () => clock,
  };
  return { deps, rows, upserts, indexed, timeouts, api: () => apiCalls, tick: (ms: number) => { clock += ms; } };
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
    // 每次 embed 推进 400ms,截止 1000ms:item 三批在 0 / 400 / 800ms 开始都未到期,第 3 批后 1200ms 到期,listing 整个跳过
    const deps: BackfillDeps = { ...w.deps, embedMany: async (t, o) => { w.tick(400); return w.deps.embedMany(t, o); } };
    const r1 = await backfillEmbeddings({ deps, deadlineMs: 1000 });
    expect(r1.perKind[0]!.embedded).toBe(120);
    expect(r1.perKind[1]!.embedded).toBe(0);
    expect(r1.done).toBe(false);
    // 每次请求的超时 = min(30s, 剩余预算):1000 → 600 → 200
    expect(w.timeouts).toEqual([1000, 600, 200]);
    const r2 = await backfillEmbeddings({ deps: w.deps });
    expect(r2.perKind[1]!.embedded).toBe(3);
    expect(r2.done).toBe(true);
  });

  it('无截止时间:请求不传 timeout(用客户端默认)', async () => {
    const w = world({ item: 2 });
    await backfillEmbeddings({ deps: w.deps, kinds: ['item'] });
    expect(w.timeouts).toEqual([undefined]);
  });

  it('剩余预算不足 5s 时 embed 失败不再重试', async () => {
    const w = world({ item: 2 });
    let calls = 0;
    const deps: BackfillDeps = { ...w.deps, embedMany: async () => { calls++; w.tick(4000); throw new Error('slow'); } };
    const r = await backfillEmbeddings({ deps, kinds: ['item'], deadlineMs: 8000 });
    expect(calls).toBe(1);
    expect(r.done).toBe(false);
  });

  it('回填期间行被编辑(版本过期)→ 计 stale 不计 embedded,下一轮以新版本补齐', async () => {
    const w = world({ item: 3 });
    // 第一批 embed 时把 item-1 的版本 +1(模拟并发编辑)
    let first = true;
    const deps: BackfillDeps = { ...w.deps, embedMany: async (t, o) => { if (first) { first = false; w.rows.get('item-1')!.version++; } return w.deps.embedMany(t, o); } };
    const r1 = await backfillEmbeddings({ deps, kinds: ['item'], maxBatches: 1 });
    expect(r1.perKind[0]).toMatchObject({ embedded: 2, stale: 1, failed: 0, drained: false });
    const r2 = await backfillEmbeddings({ deps, kinds: ['item'] });
    expect(r2.perKind[0]).toMatchObject({ embedded: 1, stale: 0, drained: true });
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
        w.rows.get(id)!.embedded = true; return true;
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
