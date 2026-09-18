// Sprint 10C / 10D:LLM 调用计费流水 + 当日预算
//
// embed 与 chat 调用统一经 recordUsage 记一行(LlmUsage 表)。用途:
//   - 10C 费用护栏:当日总费用 ≥ SEARCH_AI_DAILY_BUDGET_USD(默认 2)→ 对话接口 503,第 2 层隐藏,第 1 层不受影响
//   - 10D admin 费用面板与每日摘要
// 记账永不抛错:记不上只 warn,不能让业务调用失败。表里不含任何用户内容或标识。

import { prisma } from '@/lib/prisma';

/**
 * 单价(美元 / 百万 token)。来源:各家定价页,2026-09 抄录;llm.ts 顶部注释同源。
 * 按模型名前缀匹配;未知模型用 DEFAULT(偏保守,宁可高估)。
 */
export const PRICES_PER_M: { prefix: string; in: number; out: number }[] = [
  { prefix: 'text-embedding-3-small', in: 0.02, out: 0 },
  { prefix: 'text-embedding-3-large', in: 0.13, out: 0 },
  { prefix: 'deepseek-v4-flash', in: 0.14, out: 0.28 },
  { prefix: 'deepseek-v4-pro', in: 0.435, out: 0.87 },
  { prefix: 'deepseek', in: 0.435, out: 0.87 },
];
const DEFAULT_PRICE = { in: 1, out: 2 };

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICES_PER_M.find(x => model.startsWith(x.prefix)) ?? DEFAULT_PRICE;
  const cost = (Math.max(0, promptTokens) * p.in + Math.max(0, completionTokens) * p.out) / 1e6;
  return Math.round(cost * 1e8) / 1e8;
}

/** UTC 日期键 YYYY-MM-DD */
export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export interface UsageInput {
  /** 'embed' | 'search-chat' | ... */
  endpoint: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface UsageDb {
  llmUsage: {
    create(args: { data: { endpoint: string; model: string; promptTokens: number; completionTokens: number; estCostUsd: number; day: string } }): Promise<unknown>;
    aggregate(args: { where: { day: string }; _sum: { estCostUsd: true } }): Promise<{ _sum: { estCostUsd: number | null } }>;
  };
}

export async function recordUsage(u: UsageInput, db: UsageDb = prisma as unknown as UsageDb, now: () => Date = () => new Date()): Promise<number> {
  const estCostUsd = estimateCostUsd(u.model, u.promptTokens, u.completionTokens);
  try {
    await db.llmUsage.create({
      data: {
        endpoint: u.endpoint, model: u.model,
        promptTokens: Math.max(0, Math.round(u.promptTokens)), completionTokens: Math.max(0, Math.round(u.completionTokens)),
        estCostUsd, day: dayKey(now()),
      },
    });
  } catch (e) {
    console.warn('[llmUsage] 记账失败(忽略):', (e as Error)?.message ?? e);
  }
  return estCostUsd;
}

export async function todayCostUsd(db: UsageDb = prisma as unknown as UsageDb, now: () => Date = () => new Date()): Promise<number> {
  const r = await db.llmUsage.aggregate({ where: { day: dayKey(now()) }, _sum: { estCostUsd: true } });
  return r._sum.estCostUsd ?? 0;
}

/** 单日预算(美元)。默认 2;设 0 = 直接熔断(对话接口恒 503) */
export function dailyBudgetUsd(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SEARCH_AI_DAILY_BUDGET_USD;
  if (raw === undefined || raw === '') return 2;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : 2;
}

/** 预算熔断:今日费用 ≥ 预算。查库失败按"未超"处理(记账故障不该关掉功能;单次调用仍有 max_tokens 兜底) */
export async function isBudgetExceeded(db: UsageDb = prisma as unknown as UsageDb, env: NodeJS.ProcessEnv = process.env, now: () => Date = () => new Date()): Promise<boolean> {
  const budget = dailyBudgetUsd(env);
  if (budget === 0) return true;
  try {
    return (await todayCostUsd(db, now)) >= budget;
  } catch (e) {
    console.warn('[llmUsage] 读取当日费用失败(按未超预算处理):', (e as Error)?.message ?? e);
    return false;
  }
}
