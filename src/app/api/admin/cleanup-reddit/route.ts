// Phase 3B 一次性清理:hard delete 所有 reddit_vt / reddit_nrv 历史 Event 数据
//
// Sprint 7 Phase 3B 砍 Reddit:scraper 已移除,本 endpoint 清生产数据库残留
// 部署 3B.1 后 Sean 调用一次,确认 deletedCount 后即可不再访问(可未来删除该 route)
//
// 鉴权:沿用 admin cookie。POST + admin only。GET 返 dry-run preview。
//
// 级联删除靠应用层显式删:Prisma schema 上 Event 没有声明 onDelete,
// 但 EventComment / EventContactSend / EventClickThrottle 通过 eventId 引用,
// 顺序删 child → parent 保证 FK 一致(SQLite 不强制 FK,Postgres 强制)

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/adminAuth';

const REDDIT_SOURCES = ['reddit_vt', 'reddit_nrv'];

export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const eventIds = await prisma.event.findMany({
    where: { source: { in: REDDIT_SOURCES } },
    select: { id: true, source: true },
  });

  const byCategory = await prisma.event.groupBy({
    by: ['category'],
    where: { source: { in: REDDIT_SOURCES } },
    _count: { id: true },
  });

  return NextResponse.json({
    dryRun: true,
    totalEvents: eventIds.length,
    bySource: REDDIT_SOURCES.map(s => ({
      source: s,
      count: eventIds.filter(e => e.source === s).length,
    })),
    byCategory: byCategory.map(r => ({ category: r.category, count: r._count.id })),
    note: 'POST 此 endpoint 触发实际删除。GET 仅预览。',
  });
}

export async function POST() {
  if (!isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const eventIds = await prisma.event.findMany({
    where: { source: { in: REDDIT_SOURCES } },
    select: { id: true },
  });
  const ids = eventIds.map(e => e.id);

  if (ids.length === 0) {
    return NextResponse.json({ deleted: { events: 0, comments: 0, contactSends: 0, clickThrottles: 0 } });
  }

  // 顺序:child → parent
  const [comments, contactSends, clickThrottles] = await Promise.all([
    prisma.eventComment.deleteMany({ where: { eventId: { in: ids } } }),
    prisma.eventContactSend.deleteMany({ where: { eventId: { in: ids } } }),
    prisma.eventClickThrottle.deleteMany({ where: { eventId: { in: ids } } }),
  ]);
  const events = await prisma.event.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({
    deleted: {
      events: events.count,
      comments: comments.count,
      contactSends: contactSends.count,
      clickThrottles: clickThrottles.count,
    },
  });
}
