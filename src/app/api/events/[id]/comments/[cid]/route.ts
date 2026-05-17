// /api/events/[id]/comments/[cid] — 评论 owner 操作(自己的评论才能改/删)
// admin 删除走 /admin 路由(走 isAdmin cookie 校验)
//
// DELETE: soft delete, status='hidden'(保留记录方便 audit)
// PATCH:  改 content,更新 updatedAt(若 schema 有该字段)

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

// Phase 3C: 评论修改 — 仅 visitor owner 自己可改
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; cid: string } },
) {
  const visitorId = req.cookies.get(VID_COOKIE)?.value;
  if (!visitorId) {
    return NextResponse.json({ ok: false, error: '请先发过评论再修改' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim().slice(0, 300) : '';
  if (!content) {
    return NextResponse.json({ ok: false, error: '评论内容不能为空' }, { status: 400 });
  }

  const comment = await prisma.eventComment.findUnique({
    where: { id: params.cid },
    select: { id: true, visitorId: true, eventId: true, status: true },
  });
  if (!comment) {
    return NextResponse.json({ ok: false, error: '评论不存在' }, { status: 404 });
  }
  if (comment.eventId !== params.id) {
    return NextResponse.json({ ok: false, error: '评论与 event 不匹配' }, { status: 400 });
  }
  if (comment.visitorId !== visitorId) {
    return NextResponse.json({ ok: false, error: '只能修改自己的评论' }, { status: 403 });
  }
  if (comment.status !== 'active') {
    return NextResponse.json({ ok: false, error: '已删除的评论不能修改' }, { status: 400 });
  }

  const updated = await prisma.eventComment.update({
    where: { id: params.cid },
    data: { content },
    select: { id: true, content: true, nickname: true, createdAt: true },
  });
  return NextResponse.json({
    ok: true,
    comment: {
      id: updated.id,
      content: updated.content,
      nickname: updated.nickname,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}
