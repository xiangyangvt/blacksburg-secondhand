// POST /api/listings/[id]/view — 室友 / 转租卡片被主动展开 / 查看时累计 viewCount
//
// 定义为"主动查看"而不是曝光：只有用户点开卡片或深链自动展开才计数。
// 同 visitor 同 listing 24 小时内只计一次，避免刷新/误触刷高。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVisitorId, isBotUA, setVisitorCookie } from '@/lib/rateLimit';

const THROTTLE_HOURS = 24;
const db = prisma as any;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const listingId = params.id;
  if (!listingId) return NextResponse.json({ ok: false }, { status: 400 });

  if (isBotUA(req, 'full')) {
    return NextResponse.json({ ok: true, skipped: 'bot' });
  }

  const { visitorId, isNew } = getVisitorId(req);
  const cutoff = new Date(Date.now() - THROTTLE_HOURS * 3600e3);

  try {
    const recent = await db.listingViewThrottle.findUnique({
      where: { listingId_visitorId: { listingId, visitorId } },
    });

    if (recent && recent.viewedAt > cutoff) {
      const listing = await db.listing.findUnique({
        where: { id: listingId },
        select: { viewCount: true },
      });
      const res = NextResponse.json({ ok: true, counted: false, viewCount: listing?.viewCount ?? 0 });
      if (isNew) setVisitorCookie(res, visitorId);
      return res;
    }

    await db.listingViewThrottle.upsert({
      where: { listingId_visitorId: { listingId, visitorId } },
      create: { listingId, visitorId },
      update: { viewedAt: new Date() },
    });

    const listing = await db.listing.update({
      where: { id: listingId },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });

    const res = NextResponse.json({ ok: true, counted: true, viewCount: listing.viewCount });
    if (isNew) setVisitorCookie(res, visitorId);
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
}

