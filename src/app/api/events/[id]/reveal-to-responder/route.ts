// Phase 3B POST /api/events/[id]/reveal-to-responder
//
// 用途:发起人(event poster)把自己的联系方式回赠给某个响应者。
// 响应者已经主动发过 EventContactSend (from=responder, to=poster);
// 这里创建反向 send (from=poster, to=responder),两条都存在 = 双方互见。
//
// 鉴权:cookie visitorId 必须是 event.posterVisitorId
//
// body: {
//   responderSendId: string,   // 响应者那条 send 的 id(/api/my/events 返的 responder.id)
//   nickname: string,          // 我的昵称(可改)
//   contactType: 'wechat'|'phone'|'discord'|'email'|'other',
//   contact: string,
//   contactLabel?: string,     // contactType=other 时
// }

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const VID_COOKIE = 'hb_vid';
const ALLOWED_CONTACT_TYPES = new Set(['wechat', 'phone', 'discord', 'email', 'other']);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const visitorId = req.cookies.get(VID_COOKIE)?.value;
  if (!visitorId) return NextResponse.json({ ok: false, error: 'no visitor' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: '无效请求' }, { status: 400 }); }

  const responderSendId = (body.responderSendId ?? '').toString();
  const nickname        = (body.nickname        ?? '').toString().trim().slice(0, 20);
  const contactType     = (body.contactType     ?? '').toString();
  const contact         = (body.contact         ?? '').toString().trim().slice(0, 80);
  const contactLabel    = (body.contactLabel    ?? '').toString().trim().slice(0, 20) || null;

  if (!responderSendId) return NextResponse.json({ ok: false, error: '缺少 responderSendId' }, { status: 400 });
  if (!nickname)        return NextResponse.json({ ok: false, error: '请填写昵称' }, { status: 400 });
  if (!ALLOWED_CONTACT_TYPES.has(contactType)) {
    return NextResponse.json({ ok: false, error: '联系方式类型不支持' }, { status: 400 });
  }
  if (!contact) return NextResponse.json({ ok: false, error: '请填写联系方式' }, { status: 400 });
  if (contactType === 'other' && !contactLabel) {
    return NextResponse.json({ ok: false, error: '请说明「其他」类型(如 Line / Telegram)' }, { status: 400 });
  }

  // 查响应者那条 send,反查 fromVisitorId(= 响应者)
  const responderSend = await prisma.eventContactSend.findUnique({
    where: { id: responderSendId },
    select: { id: true, fromVisitorId: true, eventId: true, status: true },
  });
  if (!responderSend) return NextResponse.json({ ok: false, error: '响应记录不存在' }, { status: 404 });
  if (responderSend.eventId !== params.id) {
    return NextResponse.json({ ok: false, error: '记录与 event 不匹配' }, { status: 400 });
  }
  if (responderSend.status === 'canceled') {
    return NextResponse.json({ ok: false, error: '对方已撤回,无法回赠' }, { status: 400 });
  }

  // 验 event 存在 + 我是 poster
  const event = await prisma.event.findUnique({
    where: { id: params.id },
    select: { id: true, source: true, posterVisitorId: true },
  });
  if (!event) return NextResponse.json({ ok: false, error: 'event 不存在' }, { status: 404 });
  if (event.source !== 'user' || !event.posterVisitorId) {
    return NextResponse.json({ ok: false, error: '此活动不是用户发起的' }, { status: 400 });
  }
  if (event.posterVisitorId !== visitorId) {
    return NextResponse.json({ ok: false, error: '只有发起人可以回赠联系方式' }, { status: 403 });
  }
  if (responderSend.fromVisitorId === visitorId) {
    return NextResponse.json({ ok: false, error: '不能回赠给自己' }, { status: 400 });
  }

  // upsert 反向 send: from=poster, to=responder
  await prisma.eventContactSend.upsert({
    where: {
      eventId_fromVisitorId_toVisitorId: {
        eventId: params.id,
        fromVisitorId: visitorId,
        toVisitorId: responderSend.fromVisitorId,
      },
    },
    create: {
      eventId: params.id,
      fromVisitorId: visitorId,
      fromNickname: nickname,
      fromContactType: contactType,
      fromContact: contact,
      fromContactLabel: contactLabel,
      toVisitorId: responderSend.fromVisitorId,
      toCommentId: null,
      nickname,
      note: null,
    },
    update: {
      fromNickname: nickname,
      fromContactType: contactType,
      fromContact: contact,
      fromContactLabel: contactLabel,
      nickname,
      status: 'active',
      readAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
