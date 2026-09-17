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
    count(args: { where: { key: string; tag?: string; createdAt: { gt: Date }; NOT?: { tag: string } } }): Promise<number>;
    findFirst(args: {
      where: { key: string; tag?: string; createdAt: { gt: Date } };
      orderBy?: { createdAt: 'asc' | 'desc' };
      select?: { id: true; createdAt: true };
    }): Promise<{ id: string; createdAt: Date } | null>;
    create(args: { data: { key: string; tag: string | null }; select?: { id: true } }): Promise<{ id: string }>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    deleteMany(args: { where: { createdAt: { lt: Date } } }): Promise<unknown>;
  };
}

const CLEANUP_PROBABILITY = 0.01;
const CLEANUP_AGE_MS = 48 * 3600e3;

// 并发语义(Codex 互审 2026-09-17 指出 count→insert 不原子):
// 采用"先写后数":先插入自己的行,再数窗口内总数,超额就删掉自己的行并拒绝。
// 没有跨行锁,所以并发爆发时的失败方向是"过严"(同一瞬间的 N 个请求可能全被拒),
// 而不是"过宽"(放行超过 max)。对反滥用这是正确的方向;正常用户不会同一毫秒并发同一配额键。
export async function checkQuota(
  opts: QuotaOpts,
  db: QuotaDb = prisma as unknown as QuotaDb,
  now: () => number = Date.now,
  rand: () => number = Math.random,
): Promise<QuotaResult> {
  const tag = opts.tag ? opts.tag : null; // 空串视为无 tag
  const since = new Date(now() - opts.windowMs);
  const where = { key: opts.key, createdAt: { gt: since } };

  if (tag) {
    const dup = await db.rateLimitHit.findFirst({ where: { ...where, tag }, select: { id: true, createdAt: true } });
    if (dup) {
      const used = await db.rateLimitHit.count({ where });
      return { ok: true, remaining: Math.max(0, opts.max - used), retryAfterSec: 0 };
    }
  }

  const mine = await db.rateLimitHit.create({ data: { key: opts.key, tag }, select: { id: true } });

  if (tag) {
    // 并发下同 tag 可能双写:只保留最早那行,自己不是最早就撤回,仍按"去重命中"返回
    const dupCount = await db.rateLimitHit.count({ where: { ...where, tag } });
    if (dupCount > 1) {
      const earliest = await db.rateLimitHit.findFirst({ where: { ...where, tag }, orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true } });
      if (earliest && earliest.id !== mine.id) {
        await db.rateLimitHit.delete({ where: { id: mine.id } });
        const used = await db.rateLimitHit.count({ where });
        return { ok: true, remaining: Math.max(0, opts.max - used), retryAfterSec: 0 };
      }
    }
  }

  // 带 tag 时排除同 tag 的全部行再 +1 算自己:并发双写的重复行(稍后会自删)不会把赢家挤出配额
  const used = tag
    ? (await db.rateLimitHit.count({ where: { ...where, NOT: { tag } } })) + 1
    : await db.rateLimitHit.count({ where }); // 含自己
  if (used > opts.max) {
    await db.rateLimitHit.delete({ where: { id: mine.id } });
    const oldest = await db.rateLimitHit.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true } });
    const retryAfterSec = oldest
      ? Math.max(1, Math.ceil((oldest.createdAt.getTime() + opts.windowMs - now()) / 1000))
      : Math.ceil(opts.windowMs / 1000);
    return { ok: false, remaining: 0, retryAfterSec };
  }

  if (rand() < CLEANUP_PROBABILITY) {
    // 机会式清理,失败不影响主流程
    db.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(now() - CLEANUP_AGE_MS) } } }).catch(() => {});
  }

  return { ok: true, remaining: opts.max - used, retryAfterSec: 0 };
}
