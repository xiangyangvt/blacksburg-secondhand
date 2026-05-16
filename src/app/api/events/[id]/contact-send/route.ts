// POST /api/events/[id]/contact-send — 向评论作者 或 user-posted event 的 poster 发送我的联系方式
//
// body: { toCommentId?, nickname, contactType, contact, contactLabel? }
//   - 有 toCommentId → 发给该评论的作者
//   - 无 toCommentId → 发给 event 的 poster(仅 source='user' 的 event 支持)
//
// 防刷:同 event 同 from→to 只能发一次(DB unique constraint)
// 注:Sean 设计 — asymmetric, 无 accept/decline,B 收到后是否回赠完全独立
//
// 安全:visitorId 不暴露给客户端(只用 toCommentId 或 event.posterVisitorId 间接路由)

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

  const toCommentId    = body.toCommentId ? (body.toCommentId ?? '').toString() : null;
  const nickname       = (body.nickname       ?? '').toString().trim().slice(0, 20);
  const contactType    = (body.contactType    ?? '').toString();
  const contact        = (body.contact        ?? '').toString().trim().slice(0, 80);
  const contactLabel   = (body.contactLabel   ?? '').toString().trim().slice(0, 20) || null;

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

  // 确定 toVisitorId — 两种来源:
  //   1. toCommentId 指向某评论 → 评论作者
  //   2. 无 toCommentId → event poster(source='user')
  let toVisitorId: string;
  let resolvedCommentId: string | null = null;

  if (toCommentId) {
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
    toVisitorId = targetComment.visitorId;
    resolvedCommentId = targetComment.id;
  } else {
    // 发给 event poster — 只对 user-posted event 有效
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, source: true, posterVisitorId: true },
    });
    if (!event) return NextResponse.json({ ok: false, error: 'event 不存在' }, { status: 404 });
    if (event.source !== 'user' || !event.posterVisitorId) {
      return NextResponse.json({ ok: false, error: '此活动不支持直接发联系方式(请在某条评论上发送)' }, { status: 400 });
    }
    if (event.posterVisitorId === fromVisitorId) {
      return NextResponse.json({ ok: false, error: '不能给自己发布的活动发联系方式' }, { status: 400 });
    }
    toVisitorId = event.posterVisitorId;
  }

  // event 存在性(toCommentId 路径已查过,此处只在 toCommentId 路径里二次确认 — 上面 if 已经隐式校验,跳过)
  if (toCommentId) {
    const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!ev) return NextResponse.json({ ok: false, error: 'event 不存在' }, { status: 404 });
  }

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
        toVisitorId,
        toCommentId: resolvedCommentId,
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
