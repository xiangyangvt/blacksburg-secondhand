// Sprint 7 Phase 1.7:events 公开列表 API
// 给 /localnews 页面 fetch 用

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/events?category=events|sports|news|discussion&limit=50
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const category = sp.get('category');
  const limitRaw = sp.get('limit');
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 100) : 50;

  // 过滤:仅 active + qualityScore ≥ 0.5 + 未过期(过期 = endAt 已过 OR 没 endAt 但 startAt 早于 1 天前)
  const oneDayAgo = new Date(Date.now() - 86400000);

  const where: any = {
    status: 'active',
    qualityScore: { gte: 0.5 },
    OR: [
      { endAt: { gte: new Date() } },
      { endAt: null, startAt: { gte: oneDayAgo } },
      { startAt: null }, // 没时间的 evergreen 也展示
    ],
  };
  if (category) where.category = category;

  const events = await prisma.event.findMany({
    where,
    orderBy: [
      { startAt: 'asc' },
      { scrapedAt: 'desc' },
    ],
    take: limit,
  });

  return NextResponse.json({ events });
}
