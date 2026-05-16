// POST /api/events/[id]/contact-send — 向某条评论的作者发送我的联系方式
//
// body: { toCommentId, nickname, contactType, contact, contactLabel? }
// 防刷:同 event 同 from→to 只能发一次(DB unique constraint)
// 注:Sean 设计 — asymmetric, 无 accept/decline,B 收到后是否回赠完全独立
//
// 安全:visitorId 不暴露给客户端(只用 toCommentId 引用目标)
// server 根据 toCommentId 查出 comment.visitorId 作为 toVisitorId

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

const VID_COOKIE = 'hb_vid';
const VID_MAX_AGE = 60 * 60 * 24 * 365;
const ALLOWED_CONTACT_TYPES = new Set(['wechat', 'phone', 'discord', 'email', 'other']);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const eventId = params.id;
  if (!eventId) return NextResponse.json({ ok: false }, { status: 400 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: '无效请求' }, { status: 400 }); }

  const toCommentId    = (body.toCommentId    ?? '').toString();
  const nickname       = (body.nickname       ?? '').toString().trim().slice(0, 20);
  const contactType    = (body.contactType    ?? '').toString();
  const contact        = (body.contact        ?? '').toString().trim().slice(0, 80);
  const contactLabel   = (body.contactLabel   ?? '').toString().trim().slice(0, 20) || null;

  if (!toCommentId) return NextResponse.json({ ok: false, error: '缺少目标评论' }, { status: 400 });
  if (!nickname)    return NextResponse.json({ ok: false, error: '请填写昵称' }, { status: 400 });
  if (!ALLOWED_CONTACT_TYPES.has(contactType)) {
    return NextResponse.json({ ok: false, error: '联系方式类型不支持' }, { status: 400 });
  }
  if (!contact) return NextResponse.json({ ok: false, error: '请填写联系方式' }, { status: 400 });
  if (contactType === 'other' && !contactLabel) {
    return NextResponse.json({ ok: false, error: '请说明「其他」类型(如 Line / Telegram)' }, { status: 400 });
  }

  // 取 visitorId(发送者)
  const existing = req.cookies.get(VID_COOKIE)?.value;
  const fromVisitorId = existing || randomUUID();

  // 查目标评论 → 拿 toVisitorId
  const targetComment = await prisma.eventComment.findUnique({
    where: { id: toCommentId },
    select: { id: true, visitorId: true, eventId: true, status: true },
  });
  if (!targetComment || targetComment.status !== 'active') {
    return NextResponse.json({ ok: false, error: '目标评论不存在或已删除' }, { status: 404 });
  }
  if (targetComment.eventId !== eventId) {
    return NextResponse.json({ ok: false, error: '评论与 event 不匹配' }, { status: 400 });
  }
  if (targetComment.visitorId === fromVisitorId) {
    return NextResponse.json({ ok: false, error: '不能给自己的评论发联系方式' }, { status: 400 });
  }

  // event 存在性
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) return NextResponse.json({ ok: false, error: 'event 不存在' }, { status: 404 });

  // 创建(unique 约束在 DB 层自动防重复)
  try {
    const send = await prisma.eventContactSend.create({
      data: {
        eventId,
        fromVisitorId,
        fromNickname: nickname,
        fromContactType: contactType,
        fromContact: contact,
        fromContactLabel: contactLabel,
        toVisitorId: targetComment.visitorId,
        toCommentId: targetComment.id,
      },
    });

    const res = NextResponse.json({ ok: true, send: { id: send.id, createdAt: send.createdAt } });
    if (!existing) setVisitorCookie(res, fromVisitorId);
    return res;
  } catch (e: any) {
    // unique 冲突 → 已经发过
    if (e?.code === 'P2002') {
      return NextResponse.json({ ok: false, error: '已经向 TA 发过联系方式了' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: '发送失败' }, { status: 500 });
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
