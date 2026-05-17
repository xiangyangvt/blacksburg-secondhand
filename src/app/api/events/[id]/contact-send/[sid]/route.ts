// DELETE /api/events/[id]/contact-send/[sid] — 撤回我发出的联系方式(hard delete,legacy)
// PATCH  /api/events/[id]/contact-send/[sid] — soft cancel,status='canceled'(Phase 3B 偏好)
//
// 鉴权:cookie visitorId 必须 === send.fromVisitorId

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const VID_COOKIE = 'hb_vid';

async function authAndLoad(req: NextRequest, eventId: string, sid: string) {
  const visitorId = req.cookies.get(VID_COOKIE)?.value;
  if (!visitorId) return { error: 'no visitor', status: 401 } as const;

  const send = await prisma.eventContactSend.findUnique({
    where: { id: sid },
    select: { id: true, fromVisitorId: true, eventId: true, status: true },
  });
  if (!send) return { error: '记录不存在', status: 404 } as const;
  if (send.eventId !== eventId) return { error: 'event 不匹配', status: 400 } as const;
  if (send.fromVisitorId !== visitorId) return { error: '只能撤回自己发的', status: 403 } as const;

  return { send } as const;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; sid: string } },
) {
  const r = await authAndLoad(req, params.id, params.sid);
  if ('error' in r) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });

  await prisma.eventContactSend.delete({ where: { id: params.sid } });
  return NextResponse.json({ ok: true });
}

// Phase 3B: soft cancel — 保留记录(响应数 = status != 'canceled');
// 撤回后响应者再点"发送联系方式"会走 upsert 重新激活
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; sid: string } },
) {
  const r = await authAndLoad(req, params.id, params.sid);
  if ('error' in r) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });

  await prisma.eventContactSend.update({
    where: { id: params.sid },
    data: { status: 'canceled' },
  });
  return NextResponse.json({ ok: true });
}
