import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/utils';

const HIDE_THRESHOLD = 3; // 累计 3 个不同 IP 举报自动隐藏

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { targetType, targetId, reason } = body;
  if (targetType !== 'item' && targetType !== 'inquiry') {
    return NextResponse.json({ error: 'targetType 不合法' }, { status: 400 });
  }
  if (typeof targetId !== 'string' || !targetId) {
    return NextResponse.json({ error: 'targetId 必填' }, { status: 400 });
  }

  const ip = getClientIp(req);

  await prisma.report.create({
    data: {
      targetType,
      itemId:    targetType === 'item'    ? targetId : null,
      inquiryId: targetType === 'inquiry' ? targetId : null,
      reason: typeof reason === 'string' ? reason.slice(0, 200) : '',
      reporterIp: ip,
    },
  });

  // 自动隐藏机制
  if (targetType === 'item') {
    const reports = await prisma.report.findMany({
      where: { itemId: targetId },
      select: { reporterIp: true },
    });
    const uniqueIps = new Set(reports.map(r => r.reporterIp).filter(Boolean));
    if (uniqueIps.size >= HIDE_THRESHOLD) {
      await prisma.item.update({ where: { id: targetId }, data: { status: 'hidden' } });
    }
  }
  // inquiry 同理（这里先不做，简化 MVP）

  return NextResponse.json({ success: true });
}
