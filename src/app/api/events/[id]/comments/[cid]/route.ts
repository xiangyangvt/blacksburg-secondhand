// DELETE /api/events/[id]/comments/[cid] — 删评论(仅 owner 自己)
// admin 删除走 /admin 路由(走 isAdmin cookie 校验)
//
// soft delete:status='hidden';保留记录方便 audit

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const VID_COOKIE = 'hb_vid';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; cid: string } },
) {
  const visitorId = req.cookies.get(VID_COOKIE)?.value;
  if (!visitorId) {
    return NextResponse.json({ ok: false, error: '请先发过评论再删除' }, { status: 401 });
  }

  const comment = await prisma.eventComment.findUnique({
    where: { id: params.cid },
    select: { id: true, visitorId: true, eventId: true },
  });
  if (!comment) {
    return NextResponse.json({ ok: false, error: '评论不存在' }, { status: 404 });
  }
  if (comment.eventId !== params.id) {
    return NextResponse.json({ ok: false, error: '评论与 event 不匹配' }, { status: 400 });
  }
  if (comment.visitorId !== visitorId) {
    return NextResponse.json({ ok: false, error: '只能删除自己的评论' }, { status: 403 });
  }

  await prisma.eventComment.update({
    where: { id: params.cid },
    data: { status: 'hidden' },
  });
  return NextResponse.json({ ok: true });
}
