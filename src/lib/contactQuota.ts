// 联系方式披露配额(Sprint 9A)
//
// 所有"把一条联系方式交给客户端"的接口都必须经过 gateReveal:
//   - bot UA 直接 403
//   - 同 visitor 30 次/小时、120 次/天;同 IP 60 次/小时(校园 NAT 给余量)
//   - 同 visitor 对同一目标(tag)重复取不计数(刷新页面不消耗配额)
//   - 超限 429,带 Retry-After 与中英文提示
// 不变量(ARCHITECTURE.md §8.10):公开列表接口不得携带联系方式;联系方式只能经此门逐条下发。

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/utils';
import { checkQuota, getVisitorId, isBotUA, setVisitorCookie, type QuotaDb } from '@/lib/rateLimit';
import { prisma } from '@/lib/prisma';

export const REVEAL_LIMITS = {
  visitorPerHour: 30,
  visitorPerDay: 120,
  ipPerHour: 60,
} as const;

const HOUR = 3600e3;
const DAY = 24 * HOUR;

export const REVEAL_LIMIT_MESSAGE = {
  zh: '联系方式查看次数已达上限,请稍后再试',
  en: 'Contact reveal limit reached. Please try again later.',
};

export type RevealGate =
  | { ok: true; visitorId: string; withCookie: <T extends NextResponse>(res: T) => T }
  | { ok: false; res: NextResponse };

/**
 * @param tag 目标标识,如 `item:<id>` / `inq:<id>` / `by:<value>`。同 visitor 同 tag 重复不计数。
 */
export async function gateReveal(
  req: NextRequest,
  tag: string,
  db: QuotaDb = prisma as unknown as QuotaDb,
): Promise<RevealGate> {
  if (isBotUA(req, 'full')) {
    return { ok: false, res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  const { visitorId, isNew } = getVisitorId(req);
  const ip = getClientIp(req);
  const withCookie = <T extends NextResponse>(res: T): T => {
    if (isNew) setVisitorCookie(res, visitorId);
    return res;
  };

  // 顺序:先严后宽。被拒的尝试也计入(见 rateLimit.ts 语义),所以三条都记是有意的
  const checks = [
    { key: `reveal:vid:${visitorId}:h`, windowMs: HOUR, max: REVEAL_LIMITS.visitorPerHour, tag },
    { key: `reveal:vid:${visitorId}:d`, windowMs: DAY, max: REVEAL_LIMITS.visitorPerDay, tag },
    { key: `reveal:ip:${ip}:h`, windowMs: HOUR, max: REVEAL_LIMITS.ipPerHour, tag: `${visitorId}:${tag}` },
  ];
  let retryAfterSec = 0;
  let limited = false;
  for (const c of checks) {
    const r = await checkQuota(c, db);
    if (!r.ok) { limited = true; retryAfterSec = Math.max(retryAfterSec, r.retryAfterSec); }
  }
  if (limited) {
    const res = NextResponse.json(
      { error: REVEAL_LIMIT_MESSAGE.zh, errorEn: REVEAL_LIMIT_MESSAGE.en, retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    );
    return { ok: false, res: withCookie(res) };
  }
  return { ok: true, visitorId, withCookie };
}
