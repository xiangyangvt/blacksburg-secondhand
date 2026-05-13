// POST /api/listings/[id]/inquiries  ——  listing 公开留言 / Q&A
// 用法跟二手 item 的 inquiry 一致，复用 Inquiry 表 + listingId 字段
// 应用场景：候选者问户型/邻居/位置等不敏感问题（敏感的"加微信"走 application 私密路径）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CONTACT_TYPES, getClientIp } from '@/lib/utils';

const VALID_CONTACT_TYPES = CONTACT_TYPES.map(c => c.id);

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { contactType, contactValue, customContactLabel, message, utmSource } = body;
  const cleanedUtm = typeof utmSource === 'string' && utmSource ? utmSource.slice(0, 64) : null;

  if (!VALID_CONTACT_TYPES.includes(contactType)) return err('联系方式类型不合法');
  if (typeof contactValue !== 'string' || !contactValue.trim()) return err('联系方式不能为空');
  if (typeof message !== 'string' || !message.trim()) return err('留言不能为空');
  if (message.length > 500) return err('留言最多 500 字');

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.status !== 'active') return err('listing 不存在', 404);

  // 隐式限速：同 IP 1h 内最多 10 条留言
  const ip = getClientIp(req);
  const recentCount = await prisma.inquiry.count({
    where: { ipAddress: ip, createdAt: { gte: new Date(Date.now() - 3600e3) } },
  });
  if (recentCount >= 10) return err('留言太频繁了，请稍后再试', 429);

  const inquiry = await prisma.inquiry.create({
    data: {
      listingId: id,
      contactType,
      contactValue: contactValue.trim(),
      customContactLabel: customContactLabel?.trim() || null,
      message: message.trim(),
      ipAddress: ip,
      utmSource: cleanedUtm,
    },
  });

  // 新留言 = listing 活跃，bump 到列表前面
  await prisma.listing.update({
    where: { id },
    data: { bumpedAt: new Date() },
  });

  return NextResponse.json({ id: inquiry.id, success: true });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
