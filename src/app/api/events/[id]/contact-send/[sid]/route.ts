// DELETE /api/events/[id]/contact-send/[sid] — 撤回我发出的联系方式
//
// 行为:hard delete(因为 unique 约束在 eventId+from+to,允许之后重新发)
// 接收方下次 GET /api/my/events 时拿不到这条 → received tab 不再显示
// 注:无法回收"对方已经看过的事实",仅停止后续展示

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const VID_COOKIE = 'hb_vid';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; sid: string } },
) {
  const visitorId = req.cookies.get(VID_COOKIE)?.value;
  if (!visitorId) {
    return NextResponse.json({ ok: false, error: 'no visitor' }, { status: 401 });
  }

  const send = await prisma.eventContactSend.findUnique({
    where: { id: params.sid },
    select: { id: true, fromVisitorId: true, eventId: true },
  });
  if (!send) return NextResponse.json({ ok: false, error: '记录不存在' }, { status: 404 });
  if (send.eventId !== params.id) {
    return NextResponse.json({ ok: false, error: 'event 不匹配' }, { status: 400 });
  }
  if (send.fromVisitorId !== visitorId) {
    return NextResponse.json({ ok: false, error: '只能撤回自己发的' }, { status: 403 });
  }

  await prisma.eventContactSend.delete({ where: { id: params.sid } });
  return NextResponse.json({ ok: true });
}
