// 反滥用共用模块(Sprint 9C)
//
// 这是全站唯一的限流 / 访客标识 / bot 判断入口。API route 不要再各自内联这三样东西。
//
//   getVisitorId(req)        读 hb_vid cookie,没有就生成;返回 { visitorId, isNew }
//   readVisitorId(req)       只读,不生成(用于"没 cookie 就 401"的路由)
//   setVisitorCookie(res,id) 统一的 cookie 属性(httpOnly / lax / 1 年)
//   isBotUA(reqOrUA, level)  'basic' = bot|crawler|spider;'full' 再加 preview|headless
//   checkQuota(opts)         数据库计数的滑动窗口配额(进程重启 / 多实例都不丢)
//
// 存储用 RateLimitHit 表而不是内存:Railway 开了 sleepApplication,进程随时被回收。

import { randomUUID } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const VID_COOKIE = 'hb_vid';
export const VID_MAX_AGE = 60 * 60 * 24 * 365; // 1 年;键名不可改,老用户已有数据

export function readVisitorId(req: NextRequest): string | undefined {
  return req.cookies.get(VID_COOKIE)?.value || undefined;
}

export function getVisitorId(req: NextRequest): { visitorId: string; isNew: boolean } {
  const existing = readVisitorId(req);
  if (existing) return { visitorId: existing, isNew: false };
  return { visitorId: randomUUID(), isNew: true };
}

export function setVisitorCookie(res: NextResponse, visitorId: string): void {
  res.cookies.set(VID_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: VID_MAX_AGE,
    path: '/',
  });
}

const BOT_BASIC = ['bot', 'crawler', 'spider'];
const BOT_FULL = [...BOT_BASIC, 'preview', 'headless'];

export function isBotUA(reqOrUA: Request | string, level: 'basic' | 'full' = 'full'): boolean {
  const ua = (typeof reqOrUA === 'string' ? reqOrUA : reqOrUA.headers.get('user-agent') ?? '').toLowerCase();
  const list = level === 'basic' ? BOT_BASIC : BOT_FULL;
  return list.some(w => ua.includes(w));
}

// ===== 配额 =====

export interface QuotaOpts {
  /** 配额键,自己拼,如 `reveal:vid:${visitorId}`。同键共享一个窗口 */
  key: string;
  /** 窗口长度,毫秒。≤ 24h,更长的窗口会被清理逻辑截断 */
  windowMs: number;
  /** 窗口内允许的次数 */
  max: number;
  /** 可选去重标签:同 key + 同 tag 在窗口内只计一次(如"同 visitor 同 item 重复 reveal 不计数") */
  tag?: string;
}

export interface QuotaResult {
  ok: boolean;
  remaining: number;
  /** 超限时距最早一条命中过期的秒数;未超限为 0 */
  retryAfterSec: number;
}

// 最小化的 db 接口,方便单测注入内存实现
export interface QuotaDb {
  rateLimitHit: {
    count(args: { where: { key: string; createdAt: { gt: Date } } }): Promise<number>;
    findFirst(args: {
      where: { key: string; createdAt: { gt: Date } };
      orderBy: { createdAt: 'asc' };
      select: { createdAt: true };
    }): Promise<{ createdAt: Date } | null>;
    /** 违反 @@unique([key, tag, bucket]) 时必须抛出 { code: 'P2002' }(Prisma 语义) */
    create(args: { data: { key: string; tag: string | null; bucket: number | null }; select: { id: true } }): Promise<{ id: string }>;
    deleteMany(args: { where: { createdAt: { lt: Date } } }): Promise<unknown>;
  };
}

const CLEANUP_PROBABILITY = 0.01;
const CLEANUP_AGE_MS = 48 * 3600e3;

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

// 并发语义(Codex 互审 2026-09-17 四轮,最终设计):
// 核心不变量:**行只增不减,被拒的尝试也计入配额,绝不回滚。**
//   - 前三轮的所有反例都源于"临时行"(插入后可能被删):另一方读到它就可能空手放行。行永久后这个概念消失。
//   - 行单调增长 ⇒ 第 k 个被放行的请求在计数时至少看到 k 行 ⇒ 放行数 ≤ max,数学上不可能超额。
//   - 放行 ⇒ 自己的行(或去重命中的同 tag 行)永久存在 ⇒ 不可能"放行但无记录"。
// 代价:被拒的请求也占一行、也占配额。对反滥用这是想要的方向(刷的人越刷锁得越久),
//   正常用户不会撞到上限。插入前做一次预检,已超额就不插行,攻击下表增长上限 ≈ max + 并发数。
// 去重:数据库唯一约束 (key, tag, bucket),bucket = floor(now / windowMs)。同 tag 并发第二个 insert 被
//   数据库拒绝(P2002),视为去重命中,同样按当前计数判定。桶边界处同 tag 可能计两次,已接受。
export async function checkQuota(
  opts: QuotaOpts,
  db: QuotaDb = prisma as unknown as QuotaDb,
  now: () => number = Date.now,
  rand: () => number = Math.random,
): Promise<QuotaResult> {
  const tag = opts.tag ? opts.tag : null; // 空串视为无 tag
  const t = now();
  const since = new Date(t - opts.windowMs);
  const where = { key: opts.key, createdAt: { gt: since } };
  const bucket = tag ? Math.floor(t / opts.windowMs) : null;

  const reject = async (): Promise<QuotaResult> => {
    const oldest = await db.rateLimitHit.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    const retryAfterSec = oldest
      ? Math.max(1, Math.ceil((oldest.createdAt.getTime() + opts.windowMs - t) / 1000))
      : Math.ceil(opts.windowMs / 1000);
    return { ok: false, remaining: 0, retryAfterSec };
  };

  // 预检:已经超额就不再写行(只为控制表增长;正确性不依赖它)
  if ((await db.rateLimitHit.count({ where })) >= opts.max) return reject();

  let inserted = false;
  try {
    await db.rateLimitHit.create({ data: { key: opts.key, tag, bucket }, select: { id: true } });
    inserted = true;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // 去重命中:同 key 同 tag 本桶已有永久行
  }

  const used = await db.rateLimitHit.count({ where }); // 含自己或含已有的同 tag 行;行永不回滚
  if (used > opts.max) return reject();

  if (inserted && rand() < CLEANUP_PROBABILITY) {
    // 机会式清理 48h 前的行,失败不影响主流程
    db.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(t - CLEANUP_AGE_MS) } } }).catch(() => {});
  }
  return { ok: true, remaining: opts.max - used, retryAfterSec: 0 };
}
