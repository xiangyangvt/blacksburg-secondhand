import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/utils';

const HIDE_THRESHOLD = 3; // 累计 3 个不同 IP 举报自动隐藏

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { targetType, targetId, reason } = body;
  const VALID_TYPES = ['item', 'inquiry', 'listing', 'application'] as const;
  if (!VALID_TYPES.includes(targetType)) {
    return NextResponse.json({ error: 'targetType 不合法' }, { status: 400 });
  }
  if (typeof targetId !== 'string' || !targetId) {
    return NextResponse.json({ error: 'targetId 必填' }, { status: 400 });
  }

  const ip = getClientIp(req);

  await prisma.report.create({
    data: {
      targetType,
      itemId:        targetType === 'item'        ? targetId : null,
      inquiryId:     targetType === 'inquiry'     ? targetId : null,
      listingId:     targetType === 'listing'     ? targetId : null,
      applicationId: targetType === 'application' ? targetId : null,
      reason: typeof reason === 'string' ? reason.slice(0, 200) : '',
      reporterIp: ip,
    },
  });

  // 自动隐藏：累计 HIDE_THRESHOLD 个不同 IP 举报 → 把目标置 hidden
  const countByIp = async (where: any) => {
    const reports = await prisma.report.findMany({ where, select: { reporterIp: true } });
    return new Set(reports.map(r => r.reporterIp).filter(Boolean)).size;
  };

  if (targetType === 'item') {
    if (await countByIp({ itemId: targetId }) >= HIDE_THRESHOLD) {
      await prisma.item.update({ where: { id: targetId }, data: { status: 'hidden' } });
    }
  } else if (targetType === 'inquiry') {
    if (await countByIp({ inquiryId: targetId }) >= HIDE_THRESHOLD) {
      await prisma.inquiry.update({ where: { id: targetId }, data: { status: 'hidden' } });
    }
  } else if (targetType === 'listing') {
    if (await countByIp({ listingId: targetId }) >= HIDE_THRESHOLD) {
      await prisma.listing.update({ where: { id: targetId }, data: { status: 'hidden' } });
    }
  }
  // application 暂不做自动隐藏 —— A 自己也能 reject + 我的发布里能删

  return NextResponse.json({ success: true });
}
