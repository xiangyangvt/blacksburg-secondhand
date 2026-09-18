import { describe, it, expect } from 'vitest';
import {
  estimateCostUsd, dayKey, recordUsage, todayCostUsd, dailyBudgetUsd, isBudgetExceeded,
  reserveBudget, settleUsage, releaseReservation, type UsageDb,
} from './llmUsage';

function memDb(): UsageDb & { rows: any[]; failTx?: boolean } {
  const rows: any[] = []; let seq = 0;
  const llmUsage = {
    async create({ data }: any) { const row = { id: `u${++seq}`, ...data }; rows.push(row); return { id: row.id }; },
    async update({ where, data }: any) { const r = rows.find(x => x.id === where.id); if (!r) throw new Error('not found'); Object.assign(r, data); },
    async delete({ where }: any) { const i = rows.findIndex(x => x.id === where.id); if (i < 0) throw new Error('not found'); rows.splice(i, 1); },
    async aggregate({ where }: any) {
      const xs = rows.filter(r => r.day === where.day);
      return { _sum: { estCostUsd: xs.length ? xs.reduce((s, r) => s + r.estCostUsd, 0) : null } };
    },
  };
  // 串行事务 + 回滚:模拟"按日咨询锁 + 事务"的语义(后来者看得见先提交的预留;抛错则本事务写入全部撤销)
  let chain: Promise<unknown> = Promise.resolve();
  const db: any = {
    rows, llmUsage,
    $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      const run = chain.then(async () => {
        if (db.failTx) throw new Error('tx unavailable');
        const snapshot = rows.map(r => ({ ...r }));
        try { return await fn({ llmUsage }); }
        catch (e) { rows.splice(0, rows.length, ...snapshot); throw e; }
      });
      chain = run.catch(() => {});
      return run;
    },
  };
  return db;
}
const now = () => new Date('2026-09-18T12:00:00Z');

describe('estimateCostUsd(高峰、缓存未命中价,宁可高估)', () => {
  it('按模型前缀取单价;embedding 无输出费', () => {
    expect(estimateCostUsd('text-embedding-3-small', 1_000_000, 0)).toBeCloseTo(0.02);
    expect(estimateCostUsd('deepseek-v4-pro', 1500, 100)).toBeCloseTo((1500 * 1.32 + 100 * 3.96) / 1e6);
    expect(estimateCostUsd('deepseek-flash', 1e6, 1e6)).toBeCloseTo(1.5);
    expect(estimateCostUsd('deepseek-v4-flash', 1e6, 1e6)).toBeCloseTo(1.5);
    expect(estimateCostUsd('deepseek-chat', 1e6, 0)).toBeCloseTo(1.32); // 未知的 deepseek 名按 Pro 价
  });
  it('未知模型用更保守的默认价;负数当 0', () => {
    expect(estimateCostUsd('mystery', 1e6, 1e6)).toBeCloseTo(8);
    expect(estimateCostUsd('deepseek-v4-pro', -5, -5)).toBe(0);
  });
});

describe('recordUsage / todayCostUsd', () => {
  it('写一行,带 UTC 日期键与估算费用;当日合计只算当天', async () => {
    const db = memDb();
    await recordUsage({ endpoint: 'search-chat', model: 'deepseek-v4-pro', promptTokens: 1500, completionTokens: 100 }, db, now);
    await recordUsage({ endpoint: 'embed', model: 'text-embedding-3-small', promptTokens: 20, completionTokens: 0 }, db, now);
    await recordUsage({ endpoint: 'embed', model: 'text-embedding-3-small', promptTokens: 1e6, completionTokens: 0 }, db, () => new Date('2026-09-17T23:59:59Z'));
    expect(db.rows[0]).toMatchObject({ endpoint: 'search-chat', day: '2026-09-18', promptTokens: 1500, completionTokens: 100 });
    expect(dayKey(now())).toBe('2026-09-18');
    expect(await todayCostUsd(db, now)).toBeCloseTo(db.rows[0].estCostUsd + db.rows[1].estCostUsd);
  });
  it('表里只有端点 / 模型 / 计数 / 费用 / 日期,没有用户内容字段', async () => {
    const db = memDb();
    await recordUsage({ endpoint: 'x', model: 'y', promptTokens: 1, completionTokens: 1 }, db, now);
    expect(Object.keys(db.rows[0]).sort()).toEqual(['completionTokens', 'day', 'endpoint', 'estCostUsd', 'id', 'model', 'promptTokens']);
  });
  it('记账失败不抛', async () => {
    const db = memDb(); db.llmUsage.create = async () => { throw new Error('db down'); };
    await expect(recordUsage({ endpoint: 'x', model: 'y', promptTokens: 1, completionTokens: 1 }, db)).resolves.toBeTypeOf('number');
  });
});

describe('预算:只读判断', () => {
  it('默认 2;合法值覆盖;0 合法(=直接熔断);非法值回默认', () => {
    expect(dailyBudgetUsd({} as any)).toBe(2);
    expect(dailyBudgetUsd({ SEARCH_AI_DAILY_BUDGET_USD: '0.5' } as any)).toBe(0.5);
    expect(dailyBudgetUsd({ SEARCH_AI_DAILY_BUDGET_USD: '0' } as any)).toBe(0);
    expect(dailyBudgetUsd({ SEARCH_AI_DAILY_BUDGET_USD: '-1' } as any)).toBe(2);
    expect(dailyBudgetUsd({ SEARCH_AI_DAILY_BUDGET_USD: 'abc' } as any)).toBe(2);
  });
  it('预算 0 → 恒熔断;费用 ≥ 预算 → 熔断;否则放行', async () => {
    const db = memDb();
    expect(await isBudgetExceeded(db, { SEARCH_AI_DAILY_BUDGET_USD: '0' } as any, now)).toBe(true);
    expect(await isBudgetExceeded(db, {} as any, now)).toBe(false);
    db.rows.push({ id: 'a', day: '2026-09-18', estCostUsd: 1.2 }, { id: 'b', day: '2026-09-18', estCostUsd: 0.8 });
    expect(await isBudgetExceeded(db, {} as any, now)).toBe(true);
    expect(await isBudgetExceeded(db, { SEARCH_AI_DAILY_BUDGET_USD: '5' } as any, now)).toBe(false);
  });
  it('读费用失败 → 按已熔断处理(fail closed:计费表坏了不继续花钱)', async () => {
    const db = memDb(); db.llmUsage.aggregate = async () => { throw new Error('x'); };
    expect(await isBudgetExceeded(db, {} as any, now)).toBe(true);
  });
});

describe('预算:先预留后结算', () => {
  const R = { endpoint: 'search-chat', model: 'deepseek-v4-pro', estPromptTokens: 3000, maxCompletionTokens: 300 };
  const reservedUsd = (3000 * 1.32 + 300 * 3.96) / 1e6;

  it('预留写一行保守费用;结算改成实际;撤回删掉', async () => {
    const db = memDb();
    const r = await reserveBudget(R, db, {} as any, now);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.reservedUsd).toBeCloseTo(reservedUsd);
    expect(db.rows[0]).toMatchObject({ endpoint: 'search-chat:reserved', estCostUsd: r.reservedUsd, day: '2026-09-18' });
    await settleUsage(r.id, { endpoint: 'search-chat', model: 'deepseek-v4-pro', promptTokens: 1500, completionTokens: 100 }, db);
    expect(db.rows[0]).toMatchObject({ endpoint: 'search-chat', promptTokens: 1500, completionTokens: 100 });
    expect(db.rows[0].estCostUsd).toBeLessThan(r.reservedUsd);
    const r2 = await reserveBudget(R, db, {} as any, now);
    if (r2.ok) { await releaseReservation(r2.id, db); }
    expect(db.rows).toHaveLength(1);
  });

  it('并发临界:余额只够 1 份时,20 个并发预留**恰好放行 1 个**(不超支,也不全部互拒),被拒的不留残行', async () => {
    const db = memDb();
    const budget = 2;
    db.rows.push({ id: 'spent', day: '2026-09-18', estCostUsd: budget - reservedUsd * 1.5 }); // 只够 1 份
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveBudget(R, db, {} as any, now)));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok && r.reason === 'budget')).toHaveLength(19);
    expect(await todayCostUsd(db, now)).toBeLessThanOrEqual(budget);
    expect(db.rows.filter(r => String(r.endpoint).endsWith(':reserved'))).toHaveLength(1);
  });

  it('余额够 3 份 → 恰好放行 3 个', async () => {
    const db = memDb();
    db.rows.push({ id: 'spent', day: '2026-09-18', estCostUsd: 2 - reservedUsd * 3.5 });
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveBudget(R, db, {} as any, now)));
    expect(results.filter(r => r.ok)).toHaveLength(3);
  });

  it('预算 0 → 拒绝且不写行;超预算 → 回滚,不留残行', async () => {
    const db = memDb();
    expect(await reserveBudget(R, db, { SEARCH_AI_DAILY_BUDGET_USD: '0' } as any, now)).toEqual({ ok: false, reason: 'budget' });
    expect(db.rows).toHaveLength(0);
    db.rows.push({ id: 'spent', day: '2026-09-18', estCostUsd: 2 });
    expect(await reserveBudget(R, db, {} as any, now)).toEqual({ ok: false, reason: 'budget' });
    expect(db.rows).toHaveLength(1);
  });

  it('事务开不了 / 计费表写不了 / 读不了 → unavailable(fail closed),不留残行', async () => {
    const a = memDb(); a.failTx = true;
    expect(await reserveBudget(R, a, {} as any, now)).toEqual({ ok: false, reason: 'unavailable' });
    const b = memDb(); b.llmUsage.create = async () => { throw new Error('ro'); };
    expect(await reserveBudget(R, b, {} as any, now)).toEqual({ ok: false, reason: 'unavailable' });
    const c = memDb(); c.llmUsage.aggregate = async () => { throw new Error('x'); };
    expect(await reserveBudget(R, c, {} as any, now)).toEqual({ ok: false, reason: 'unavailable' });
    expect(c.rows).toHaveLength(0);
  });

  it('Postgres 下事务内先取按日咨询锁', async () => {
    const db = memDb(); const sqls: any[] = [];
    const orig = db.$transaction.bind(db);
    // 必须走 $executeRawUnsafe:该函数返回 void 列,query 路径在真实 Prisma + Postgres 上会反序列化失败
    db.$transaction = (fn: any) => orig((tx: any) => fn({ ...tx, $executeRawUnsafe: async (...a: any[]) => { sqls.push(a); }, $queryRawUnsafe: async () => { throw new Error('void column: UnsupportedColumnType'); } }));
    await reserveBudget(R, db, { DATABASE_URL: 'postgresql://x' } as any, now);
    expect(sqls).toEqual([['SELECT pg_advisory_xact_lock(hashtext($1))', 'llm-budget:2026-09-18']]);
    expect(db.rows.filter((r: any) => String(r.endpoint).endsWith(':reserved'))).toHaveLength(1); // 取锁没把预留搞成 unavailable
    sqls.length = 0;
    await reserveBudget(R, db, { DATABASE_URL: 'file:./dev.db' } as any, now);
    expect(sqls).toEqual([]);
  });

  it('结算失败不抛,预留额留着(宁可多算)', async () => {
    const db = memDb();
    const r = await reserveBudget(R, db, {} as any, now);
    if (!r.ok) throw new Error('unexpected');
    db.llmUsage.update = async () => { throw new Error('x'); };
    await expect(settleUsage(r.id, { endpoint: 'search-chat', model: 'deepseek-v4-pro', promptTokens: 1, completionTokens: 1 }, db)).resolves.toBeTypeOf('number');
    expect(db.rows[0].estCostUsd).toBeCloseTo(r.reservedUsd);
  });
});
