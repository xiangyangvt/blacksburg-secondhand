// GET /api/my/events — 当前 visitor 的「我的活动」聚合
//
// 返回 3 个列表 + 它们关联的 events 信息:
//   1. comments       — 我发的评论
//   2. sent           — 我发出的联系方式
//   3. received       — 别人发给我的联系方式
//
// matched 状态:对于每一条 send,如果反向 send 也存在(双方都发了),matched=true
// (这是 UI 给「已互换」标识用,不是隐私门 — Sean 设计是 send=给联系方式)
//
// 副作用:打开此 endpoint 时把所有 received 的 readAt 标 now(已读)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const VID_COOKIE = 'hb_vid';

export async function GET(req: NextRequest) {
  const visitorId = req.cookies.get(VID_COOKIE)?.value;
  if (!visitorId) {
    return NextResponse.json({ comments: [], sent: [], received: [] });
  }

  const [myComments, sent, received, myPosts] = await Promise.all([
    prisma.eventComment.findMany({
      where: { visitorId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.eventContactSend.findMany({
      where: { fromVisitorId: visitorId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.eventContactSend.findMany({
      where: { toVisitorId: visitorId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    // Phase 3A 我发的活动 — user-posted events 当前 visitor 发的
    prisma.event.findMany({
      where: {
        source: 'user',
        posterVisitorId: visitorId,
        status: 'active',
      },
      orderBy: { scrapedAt: 'desc' },
      take: 100,
    }),
  ]);

  // 配对判定:eventId + 反向 visitor 作为 key
  const receivedKeys = new Set(received.map(r => `${r.eventId}|${r.fromVisitorId}`));
  const sentKeys = new Set(sent.map(s => `${s.eventId}|${s.toVisitorId}`));

  // 批量拉 event 信息
  const allEventIds = Array.from(new Set([
    ...myComments.map(c => c.eventId),
    ...sent.map(s => s.eventId),
    ...received.map(r => r.eventId),
  ]));
  const events = allEventIds.length > 0
    ? await prisma.event.findMany({
        where: { id: { in: allEventIds } },
        select: { id: true, title: true, sourceUrl: true, startAt: true, endAt: true, category: true, location: true, status: true },
      })
    : [];
  const eventMap = new Map(events.map(e => [e.id, e]));

  // 拉目标 comment 信息(我 sent 的指向哪条评论)
  const targetCommentIds = sent.map(s => s.toCommentId).filter(Boolean) as string[];
  const targetComments = targetCommentIds.length > 0
    ? await prisma.eventComment.findMany({
        where: { id: { in: targetCommentIds } },
        select: { id: true, nickname: true, content: true, status: true },
      })
    : [];
  const tcMap = new Map(targetComments.map(c => [c.id, c]));

  // === 1. comments ===
  const commentsResult = myComments.map(c => ({
    id: c.id,
    content: c.content,
    createdAt: c.createdAt,
    eventId: c.eventId,
    event: eventMap.get(c.eventId) ?? null,
  }));

  // === 2. sent ===(我发出去的)
  const sentResult = sent.map(s => ({
    id: s.id,
    createdAt: s.createdAt,
    eventId: s.eventId,
    matched: receivedKeys.has(`${s.eventId}|${s.toVisitorId}`),
    event: eventMap.get(s.eventId) ?? null,
    target: s.toCommentId ? tcMap.get(s.toCommentId) ?? null : null,
    // 显示自己发了什么(防止用户忘了自己用啥账号发的)
    myContactType: s.fromContactType,
    myContact: s.fromContact,
    myContactLabel: s.fromContactLabel,
  }));

  // === 3. received ===(别人发给我的)
  // Sean 设计:send = 把联系方式给对方,所以 received 里始终能看到对方联系方式
  // matched 只是个状态指示(「已互换」),不影响信息显示
  const receivedResult = received.map(r => ({
    id: r.id,
    createdAt: r.createdAt,
    eventId: r.eventId,
    matched: sentKeys.has(`${r.eventId}|${r.fromVisitorId}`),
    event: eventMap.get(r.eventId) ?? null,
    fromNickname: r.fromNickname,
    fromContactType: r.fromContactType,
    fromContact: r.fromContact,
    fromContactLabel: r.fromContactLabel,
    isUnread: !r.readAt,
  }));

  // 副作用:把所有 unread 的 received 标记 readAt = now
  // (用户打开 panel = 已读;前端如果需要更精细可单独 endpoint)
  const unreadIds = received.filter(r => !r.readAt).map(r => r.id);
  if (unreadIds.length > 0) {
    await prisma.eventContactSend.updateMany({
      where: { id: { in: unreadIds } },
      data: { readAt: new Date() },
    });
  }

  // 我发的活动 — strip posterCodeHash/posterVisitorId,加 commentCount
  // 先批量查 commentCount(posts 内 join)
  const postIds = myPosts.map(p => p.id);
  const commentCounts = postIds.length > 0
    ? await prisma.eventComment.groupBy({
        by: ['eventId'],
        where: { eventId: { in: postIds }, status: 'active' },
        _count: { id: true },
      })
    : [];
  const ccMap = new Map(commentCounts.map(c => [c.eventId, c._count.id]));

  const postsResult = myPosts.map((p: any) => {
    const { posterCodeHash, posterVisitorId, photoUrls: pu, ...rest } = p;
    let photoUrls: string[] = [];
    if (pu) {
      try { photoUrls = JSON.parse(pu); } catch { photoUrls = []; }
    }
    return {
      ...rest,
      photoUrls,
      commentCount: ccMap.get(p.id) ?? 0,
    };
  });

  return NextResponse.json({
    comments: commentsResult,
    sent: sentResult,
    received: receivedResult,
    posts: postsResult,
  });
}
