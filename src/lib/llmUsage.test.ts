import { describe, it, expect } from 'vitest';
import { estimateCostUsd, dayKey, recordUsage, todayCostUsd, dailyBudgetUsd, isBudgetExceeded, type UsageDb } from './llmUsage';

function memDb(): UsageDb & { rows: any[] } {
  const rows: any[] = [];
  return {
    rows,
    llmUsage: {
      async create({ data }) { rows.push(data); },
      async aggregate({ where }) {
        const xs = rows.filter(r => r.day === where.day);
        return { _sum: { estCostUsd: xs.length ? xs.reduce((s, r) => s + r.estCostUsd, 0) : null } };
      },
    },
  };
}

describe('estimateCostUsd', () => {
  it('按模型前缀取单价;embedding 无输出费', () => {
    expect(estimateCostUsd('text-embedding-3-small', 1_000_000, 0)).toBeCloseTo(0.02);
    expect(estimateCostUsd('deepseek-v4-pro', 1500, 100)).toBeCloseTo((1500 * 0.435 + 100 * 0.87) / 1e6);
    expect(estimateCostUsd('deepseek-v4-flash', 1e6, 1e6)).toBeCloseTo(0.42);
  });
  it('未知模型用保守默认价;负数当 0', () => {
    expect(estimateCostUsd('mystery', 1e6, 1e6)).toBeCloseTo(3);
    expect(estimateCostUsd('deepseek-chat', -5, -5)).toBe(0);
  });
});

describe('recordUsage / todayCostUsd', () => {
  const now = () => new Date('2026-09-18T12:00:00Z');
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
    expect(Object.keys(db.rows[0]).sort()).toEqual(['completionTokens', 'day', 'endpoint', 'estCostUsd', 'model', 'promptTokens']);
  });
  it('记账失败不抛', async () => {
    const db: UsageDb = { llmUsage: { async create() { throw new Error('db down'); }, async aggregate() { return { _sum: { estCostUsd: null } }; } } };
    await expect(recordUsage({ endpoint: 'x', model: 'y', promptTokens: 1, completionTokens: 1 }, db)).resolves.toBeTypeOf('number');
  });
});

describe('预算', () => {
  const now = () => new Date('2026-09-18T12:00:00Z');
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
    db.rows.push({ day: '2026-09-18', estCostUsd: 1.2 }, { day: '2026-09-18', estCostUsd: 0.8 });
    expect(await isBudgetExceeded(db, {} as any, now)).toBe(true);
    expect(await isBudgetExceeded(db, { SEARCH_AI_DAILY_BUDGET_USD: '5' } as any, now)).toBe(false);
  });
  it('读费用失败按未超预算处理(记账故障不关功能)', async () => {
    const db: UsageDb = { llmUsage: { async create() {}, async aggregate() { throw new Error('x'); } } };
    expect(await isBudgetExceeded(db, {} as any, now)).toBe(false);
  });
});
