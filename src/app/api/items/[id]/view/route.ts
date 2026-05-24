// POST /api/items/[id]/view — 商品卡片被主动展开 / 查看时累计 viewCount
//
// 定义为"主动查看"而不是曝光：只有用户点开卡片或深链自动展开才计数。
// 同 visitor 同 item 24 小时内只计一次，避免刷新/误触刷高。

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

const VID_COOKIE = 'hb_vid';
const VID_MAX_AGE = 60 * 60 * 24 * 365;
const THROTTLE_HOURS = 24;
const db = prisma as any;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const itemId = params.id;
  if (!itemId) return NextResponse.json({ ok: false }, { status: 400 });

  const ua = (req.headers.get('user-agent') ?? '').toLowerCase();
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider') || ua.includes('preview') || ua.includes('headless')) {
    return NextResponse.json({ ok: true, skipped: 'bot' });
  }

  const existing = req.cookies.get(VID_COOKIE)?.value;
  const visitorId = existing || randomUUID();
  const cutoff = new Date(Date.now() - THROTTLE_HOURS * 3600e3);

  try {
    const recent = await db.itemViewThrottle.findUnique({
      where: { itemId_visitorId: { itemId, visitorId } },
    });

    if (recent && recent.viewedAt > cutoff) {
      const item = await db.item.findUnique({
        where: { id: itemId },
        select: { viewCount: true },
      });
      const res = NextResponse.json({ ok: true, counted: false, viewCount: item?.viewCount ?? 0 });
      if (!existing) setVisitorCookie(res, visitorId);
      return res;
    }

    await db.itemViewThrottle.upsert({
      where: { itemId_visitorId: { itemId, visitorId } },
      create: { itemId, visitorId },
      update: { viewedAt: new Date() },
    });

    const item = await db.item.update({
      where: { id: itemId },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });

    const res = NextResponse.json({ ok: true, counted: true, viewCount: item.viewCount });
    if (!existing) setVisitorCookie(res, visitorId);
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
}

function setVisitorCookie(res: NextResponse, visitorId: string) {
  res.cookies.set(VID_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: VID_MAX_AGE,
    path: '/',
  });
}
