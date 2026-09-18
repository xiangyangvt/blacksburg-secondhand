// Sprint 10C / 10D:LLM 调用计费流水 + 当日预算
//
// embed 与 chat 调用统一记一行(LlmUsage 表)。用途:
//   - 10C 费用护栏:当日总费用 ≥ SEARCH_AI_DAILY_BUDGET_USD(默认 2)→ 对话接口 503,第 2 层隐藏,第 1 层不受影响
//   - 10D admin 费用面板与每日摘要
// 表里不含任何用户内容或标识。
//
// 预算是"先预留、后结算"(Codex 互审 #4 #5):
//   reserveBudget 先写一行按保守上限估的预留,再读当日合计;超了就撤回预留并拒绝。并发请求各自的预留互相可见,
//   所以不会出现"20 个请求同时看到未超预算全部放行"。调用完成后 settleUsage 把这行改成实际用量;
//   结算失败就让预留额留着(宁可多算)。预算状态读不到 / 写不了 → 一律按"已熔断"处理(fail closed):
//   计费表坏了就不该继续花钱,只关第 2 层,第 0、1 层不受影响。

import { prisma } from '@/lib/prisma';

/**
 * 单价(美元 / 百万 token)。来源:https://api-docs.deepseek.com/quick_start/pricing/ 与 OpenAI 定价页,2026-09-18 核对。
 * DeepSeek 分高峰 / 低峰(低峰半价)与缓存命中价;这里一律取**高峰、缓存未命中**价——预算护栏宁可高估。
 * 按模型名前缀匹配;未知模型用 DEFAULT(同样偏保守)。
 */
export const PRICES_PER_M: { prefix: string; in: number; out: number }[] = [
  { prefix: 'text-embedding-3-small', in: 0.02, out: 0 },
  { prefix: 'text-embedding-3-large', in: 0.13, out: 0 },
  { prefix: 'deepseek-flash', in: 0.3, out: 1.2 },
  { prefix: 'deepseek-v4-flash', in: 0.3, out: 1.2 },
  { prefix: 'deepseek-v4-pro', in: 1.32, out: 3.96 },
  { prefix: 'deepseek', in: 1.32, out: 3.96 },
];
const DEFAULT_PRICE = { in: 2, out: 6 };

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

interface UsageRow { endpoint: string; model: string; promptTokens: number; completionTokens: number; estCostUsd: number; day: string }

export interface UsageDb {
  llmUsage: {
    create(args: { data: UsageRow; select?: { id: true } }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: Partial<UsageRow> }): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    aggregate(args: { where: { day: string }; _sum: { estCostUsd: true } }): Promise<{ _sum: { estCostUsd: number | null } }>;
  };
}

const clampInt = (n: number) => Math.max(0, Math.round(n));

/** 事后记账(embedding 等不走预留的调用)。永不抛:记不上只 warn */
export async function recordUsage(u: UsageInput, db: UsageDb = prisma as unknown as UsageDb, now: () => Date = () => new Date()): Promise<number> {
  const estCostUsd = estimateCostUsd(u.model, u.promptTokens, u.completionTokens);
  try {
    await db.llmUsage.create({
      data: { endpoint: u.endpoint, model: u.model, promptTokens: clampInt(u.promptTokens), completionTokens: clampInt(u.completionTokens), estCostUsd, day: dayKey(now()) },
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

/** 只读判断(给 /api/search 的 chatEnabled 用)。读不到 → 按已熔断处理(fail closed) */
export async function isBudgetExceeded(db: UsageDb = prisma as unknown as UsageDb, env: NodeJS.ProcessEnv = process.env, now: () => Date = () => new Date()): Promise<boolean> {
  const budget = dailyBudgetUsd(env);
  if (budget === 0) return true;
  try {
    return (await todayCostUsd(db, now)) >= budget;
  } catch (e) {
    console.warn('[llmUsage] 读取当日费用失败(按已熔断处理):', (e as Error)?.message ?? e);
    return true;
  }
}

export type Reservation = { ok: true; id: string; reservedUsd: number } | { ok: false; reason: 'budget' | 'unavailable' };

/**
 * 付费调用前的原子预留:先写预留行(按 estPromptTokens + maxCompletionTokens 的保守费用),再读当日合计。
 * 合计 > 预算 → 撤回预留并拒绝。任何数据库故障 → 拒绝('unavailable')。
 */
export async function reserveBudget(
  r: { endpoint: string; model: string; estPromptTokens: number; maxCompletionTokens: number },
  db: UsageDb = prisma as unknown as UsageDb,
  env: NodeJS.ProcessEnv = process.env,
  now: () => Date = () => new Date(),
): Promise<Reservation> {
  const budget = dailyBudgetUsd(env);
  if (budget === 0) return { ok: false, reason: 'budget' };
  const reservedUsd = estimateCostUsd(r.model, r.estPromptTokens, r.maxCompletionTokens);
  let id: string;
  try {
    const row = await db.llmUsage.create({
      data: { endpoint: `${r.endpoint}:reserved`, model: r.model, promptTokens: 0, completionTokens: 0, estCostUsd: reservedUsd, day: dayKey(now()) },
      select: { id: true },
    });
    id = row.id;
  } catch (e) {
    console.warn('[llmUsage] 预留写入失败(按不可用处理):', (e as Error)?.message ?? e);
    return { ok: false, reason: 'unavailable' };
  }
  try {
    const total = await todayCostUsd(db, now);
    if (total > budget) {
      await db.llmUsage.delete({ where: { id } }).catch(() => {});
      return { ok: false, reason: 'budget' };
    }
    return { ok: true, id, reservedUsd };
  } catch (e) {
    console.warn('[llmUsage] 预留后读取合计失败(按不可用处理):', (e as Error)?.message ?? e);
    await db.llmUsage.delete({ where: { id } }).catch(() => {});
    return { ok: false, reason: 'unavailable' };
  }
}

/** 调用完成:把预留行改成实际用量。失败只 warn——预留额留着,宁可多算 */
export async function settleUsage(id: string, u: UsageInput, db: UsageDb = prisma as unknown as UsageDb): Promise<number> {
  const estCostUsd = estimateCostUsd(u.model, u.promptTokens, u.completionTokens);
  try {
    await db.llmUsage.update({ where: { id }, data: { endpoint: u.endpoint, model: u.model, promptTokens: clampInt(u.promptTokens), completionTokens: clampInt(u.completionTokens), estCostUsd } });
  } catch (e) {
    console.warn('[llmUsage] 结算失败(保留预留额):', (e as Error)?.message ?? e);
  }
  return estCostUsd;
}

/** 付费调用根本没发出去(客户端已断开 / 前置步骤失败):撤回预留 */
export async function releaseReservation(id: string, db: UsageDb = prisma as unknown as UsageDb): Promise<void> {
  await db.llmUsage.delete({ where: { id } }).catch((e: unknown) => console.warn('[llmUsage] 撤回预留失败(保留):', (e as Error)?.message ?? e));
}
