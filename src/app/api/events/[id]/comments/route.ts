// POST /api/events/[id]/comments — 发评论
// GET  /api/events/[id]/comments — 列评论(按时间升序)
//
// 防刷(Phase 2C):
// - 同 visitor 同 event:60 秒内最多 1 条
// - 同 visitor 全站:1 小时内最多 20 条
// - 单条 ≤ 300 字,昵称 ≤ 20 字

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVisitorId, isBotUA, readVisitorId, setVisitorCookie } from '@/lib/rateLimit';

const PER_EVENT_THROTTLE_S = 60;
const GLOBAL_LIMIT_PER_HOUR = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const eventId = params.id;
  if (!eventId) return NextResponse.json({ ok: false }, { status: 400 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: '无效请求' }, { status: 400 }); }

  const nickname = (body.nickname ?? '').toString().trim().slice(0, 20);
  const content  = (body.content  ?? '').toString().trim().slice(0, 300);

  if (!nickname) return NextResponse.json({ ok: false, error: '请填写昵称' }, { status: 400 });
  if (!content)  return NextResponse.json({ ok: false, error: '请填写评论内容' }, { status: 400 });

  // bot UA 过滤
  if (isBotUA(req, 'basic')) {
    return NextResponse.json({ ok: true, skipped: 'bot' });
  }

  const { visitorId, isNew } = getVisitorId(req);

  // 防刷 1:同 visitor + event 60s 内一条
  const oneMinAgo = new Date(Date.now() - PER_EVENT_THROTTLE_S * 1000);
  const recentOnEvent = await prisma.eventComment.findFirst({
    where: { eventId, visitorId, createdAt: { gt: oneMinAgo } },
    select: { id: true },
  });
  if (recentOnEvent) {
    return NextResponse.json({ ok: false, error: '请等一分钟再发' }, { status: 429 });
  }

  // 防刷 2:全站 1 小时 ≤ 20 条
  const oneHourAgo = new Date(Date.now() - 3600 * 1000);
  const recentGlobal = await prisma.eventComment.count({
    where: { visitorId, createdAt: { gt: oneHourAgo } },
  });
  if (recentGlobal >= GLOBAL_LIMIT_PER_HOUR) {
    return NextResponse.json({ ok: false, error: '评论过于频繁,稍后再试' }, { status: 429 });
  }

  // event 存在性
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return NextResponse.json({ ok: false, error: 'event 不存在' }, { status: 404 });

  const comment = await prisma.eventComment.create({
    data: { eventId, visitorId, nickname, content },
  });

  const res = NextResponse.json({ ok: true, comment: { ...comment, isMine: true } });
  if (isNew) setVisitorCookie(res, visitorId);
  return res;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const eventId = params.id;
  if (!eventId) return NextResponse.json({ ok: false }, { status: 400 });

  const comments = await prisma.eventComment.findMany({
    where: { eventId, status: 'active' },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  // visitorId 不暴露给客户端,只告诉客户端"哪些是我的"
  const myVid = readVisitorId(req);
  const result = comments.map(c => ({
    id: c.id,
    nickname: c.nickname,
    content: c.content,
    createdAt: c.createdAt,
    isMine: myVid ? c.visitorId === myVid : false,
  }));

  return NextResponse.json({ comments: result });
}

