// GET /api/events/[id]/og-data — Helper API for OG image renderer
//
// 设计:OG 图片 route 跑在 edge runtime,Prisma 不支持 edge,所以拆一层:
//   - 这个 route 在 node runtime 跑 Prisma 查询
//   - edge OG route fetch 这个 endpoint 拿 JSON
//
// 只返 OG 渲染需要的最小字段(title / category / customCategory / startAt / endAt /
// status / maxAttendees / responseCount),不返 posterContact 等敏感字段

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      category: true,
      customCategory: true,
      startAt: true,
      endAt: true,
      status: true,
      maxAttendees: true,
      source: true,
    },
  });

  if (!event) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  // 响应数 — EventContactSend 中 status != canceled 的数
  const responseCount = await prisma.eventContactSend.count({
    where: { eventId: params.id, status: { not: 'canceled' } },
  });

  return NextResponse.json(
    {
      ok: true,
      event: {
        id: event.id,
        title: event.title,
        category: event.category,
        customCategory: event.customCategory,
        startAt: event.startAt ? event.startAt.toISOString() : null,
        endAt: event.endAt ? event.endAt.toISOString() : null,
        status: event.status,
        maxAttendees: event.maxAttendees,
        source: event.source,
        responseCount,
      },
    },
    {
      headers: {
        // 短缓存 — 状态切换 60s 内可刷新
        'cache-control': 'public, max-age=60, s-maxage=60',
      },
    },
  );
}
