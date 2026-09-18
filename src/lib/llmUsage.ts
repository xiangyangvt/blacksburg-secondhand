// Sprint 10C / 10D:LLM 调用计费流水 + 当日预算
//
// embed 与 chat 调用统一记一行(LlmUsage 表)。用途:
//   - 10C 费用护栏:当日总费用 ≥ SEARCH_AI_DAILY_BUDGET_USD(默认 2)→ 对话接口 503,第 2 层隐藏,第 1 层不受影响
//   - 10D admin 费用面板与每日摘要
// 表里不含任何用户内容或标识。
//
// 预算是"先预留、后结算"(Codex 互审 #4 #5):
//   reserveBudget 在一个事务里(按日咨询锁串行化)写一行按保守上限估的预留并读当日合计,超了就回滚并拒绝。
//   所以不会出现"20 个请求同时看到未超预算全部放行",也不会全部互拒。调用完成后 settleUsage 把这行改成实际用量;
//   结算失败、或请求发出后被取消 / 超时(是否计费未知),就让预留额留着(宁可多算)。预算状态读不到 / 写不了 → 一律按"已熔断"处理(fail closed):
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

/** 事务内可用的最小接口 */
export interface UsageTx {
  llmUsage: {
    create(args: { data: UsageRow; select?: { id: true } }): Promise<{ id: string }>;
    aggregate(args: { where: { day: string }; _sum: { estCostUsd: true } }): Promise<{ _sum: { estCostUsd: number | null } }>;
  };
  /** 取咨询锁用 execute 而不是 query:pg_advisory_xact_lock 返回 void 列,Prisma 5.22 的 query 路径反序列化会报 UnsupportedColumnType(Codex 互审三轮 #1) */
  $executeRawUnsafe?(sql: string, ...params: unknown[]): Promise<unknown>;
}

export interface UsageDb extends UsageTx {
  llmUsage: UsageTx['llmUsage'] & {
    update(args: { where: { id: string }; data: Partial<UsageRow> }): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: UsageTx) => Promise<T>, opts?: { timeout?: number; maxWait?: number }): Promise<T>;
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

class BudgetRejected extends Error {}

const isPostgres = (env: NodeJS.ProcessEnv) => /^postgres(ql)?:/i.test(env.DATABASE_URL ?? '');

/**
 * 付费调用前的原子预留(Codex 互审两轮定稿):
 *   一个事务里:取按日咨询锁(Postgres:pg_advisory_xact_lock,事务结束自动释放;SQLite 写事务本身就是串行的)
 *   → 写预留行(estPromptTokens + maxCompletionTokens 的保守费用)→ 读当日合计 → 合计 > 预算就抛错**回滚**。
 *   - 串行化:后来的请求一定看得见前面已提交的预留,不会同时放行导致超支;余额够 1 份时恰好放行 1 个(不会全部互拒)
 *   - 拒绝 = 回滚:没有"撤回失败留下虚假支出"这回事
 *   - 任何数据库故障 → 'unavailable'(fail closed)
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
  const day = dayKey(now());
  try {
    const id = await db.$transaction(async (tx) => {
      if (isPostgres(env) && tx.$executeRawUnsafe) await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `llm-budget:${day}`);
      const row = await tx.llmUsage.create({
        data: { endpoint: `${r.endpoint}:reserved`, model: r.model, promptTokens: 0, completionTokens: 0, estCostUsd: reservedUsd, day },
        select: { id: true },
      });
      const total = (await tx.llmUsage.aggregate({ where: { day }, _sum: { estCostUsd: true } }))._sum.estCostUsd ?? 0;
      if (total > budget) throw new BudgetRejected();
      return row.id;
    }, { timeout: 8_000, maxWait: 8_000 });
    return { ok: true, id, reservedUsd };
  } catch (e) {
    if (e instanceof BudgetRejected) return { ok: false, reason: 'budget' };
    console.warn('[llmUsage] 预留事务失败(按不可用处理):', (e as Error)?.message ?? e);
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

/**
 * 撤回预留。**只能**在确定付费请求还没发出去时调用(例如预留之后、调用之前发现客户端已断开)。
 * 请求一旦发出,哪怕随后被取消 / 超时,上游可能已经计费——那种情况保留预留额,不要调这个(Codex 互审二轮 #2)。
 */
export async function releaseReservation(id: string, db: UsageDb = prisma as unknown as UsageDb): Promise<void> {
  await db.llmUsage.delete({ where: { id } }).catch((e: unknown) => console.warn('[llmUsage] 撤回预留失败(保留):', (e as Error)?.message ?? e));
}

// ===== Sprint 10D:被拒事件计数 + 汇总(admin 面板与每日摘要用) =====

/** 事件行的端点后缀。事件行 estCostUsd = 0,不影响预算合计,只用来数次数 */
export const EVENT_429 = ':429';
export const EVENT_503 = ':503';
const RESERVED = ':reserved';

/**
 * 记一次被拒(429 配额 / 503 预算熔断或计费不可用)。fire-and-forget,永不抛。
 * 为什么不直接数 RateLimitHit:那张表超额后"预检"就不再写行(控制表增长),数出来会严重偏少。
 */
const REJECTION_ROWS_PER_MINUTE = 60;
let rejectionWindow = { startedAt: 0, count: 0 };

/** 测试用:清空限速窗口 */
export function _resetRejectionThrottle(): void { rejectionWindow = { startedAt: 0, count: 0 }; }

export function recordRejection(endpoint: string, status: 429 | 503, db: UsageDb = prisma as unknown as UsageDb, now: () => number = Date.now): void {
  // 被限流的人可以反复请求,每次都写一行就成了写放大的口子。进程内每分钟最多记 60 行,超出的丢弃:
  // 面板上的次数在被刷时是下限("至少这么多次"),足够用来发现异常。
  const t = now();
  if (t - rejectionWindow.startedAt >= 60_000) rejectionWindow = { startedAt: t, count: 0 };
  if (rejectionWindow.count >= REJECTION_ROWS_PER_MINUTE) return;
  rejectionWindow.count++;
  void recordUsage({ endpoint: `${endpoint}${status === 429 ? EVENT_429 : EVENT_503}`, model: '-', promptTokens: 0, completionTokens: 0 }, db);
}

export interface UsageSummary {
  /** 估算费用(美元)。含尚未结算的预留额(保守) */
  costUsd: number;
  /** 付费调用次数(embedding + 对话;含未结算的预留) */
  calls: number;
  chatCalls: number;
  embedCalls: number;
  /** 其中尚未结算的预留行数(> 0 说明有调用中断 / 结算失败,费用按上限估) */
  unsettled: number;
  rejected429: number;
  rejected503: number;
}

export interface SummaryDb {
  llmUsage: {
    groupBy(args: { by: ['endpoint']; where: { day: { startsWith: string } } | { day: string }; _count: { _all: true }; _sum: { estCostUsd: true } }): Promise<{ endpoint: string; _count: { _all: number }; _sum: { estCostUsd: number | null } }[]>;
  };
}

export function summarize(rows: { endpoint: string; count: number; costUsd: number }[]): UsageSummary {
  const out: UsageSummary = { costUsd: 0, calls: 0, chatCalls: 0, embedCalls: 0, unsettled: 0, rejected429: 0, rejected503: 0 };
  for (const r of rows) {
    if (r.endpoint.endsWith(EVENT_429)) { out.rejected429 += r.count; continue; }
    if (r.endpoint.endsWith(EVENT_503)) { out.rejected503 += r.count; continue; }
    out.costUsd += r.costUsd;
    out.calls += r.count;
    if (r.endpoint.endsWith(RESERVED)) out.unsettled += r.count;
    if (r.endpoint === 'embed') out.embedCalls += r.count; else out.chatCalls += r.count;
  }
  out.costUsd = Math.round(out.costUsd * 1e6) / 1e6;
  return out;
}

/** dayPrefix:'YYYY-MM-DD' 取一天,'YYYY-MM' 取一个月(UTC) */
export async function usageSummary(dayPrefix: string, db: SummaryDb = prisma as unknown as SummaryDb): Promise<UsageSummary> {
  const where = dayPrefix.length === 10 ? { day: dayPrefix } : { day: { startsWith: dayPrefix } };
  const rows = await db.llmUsage.groupBy({ by: ['endpoint'], where, _count: { _all: true }, _sum: { estCostUsd: true } });
  return summarize(rows.map(r => ({ endpoint: r.endpoint, count: r._count._all, costUsd: r._sum.estCostUsd ?? 0 })));
}
