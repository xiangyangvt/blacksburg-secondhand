// POST /api/inquiries/[id]/reveal-contact
// 留言人联系方式的唯一下发口。任何访客可调,但经 gateReveal 配额(Sprint 9A)。
// 不记 contactRevealCount(对留言人本人没有意义)。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gateReveal } from '@/lib/contactQuota';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    select: { status: true, contactType: true, contactValue: true, customContactLabel: true },
  });
  if (!inquiry || inquiry.status !== 'active') {
    return NextResponse.json({ error: '留言不存在或已隐藏' }, { status: 404 });
  }

  const gate = await gateReveal(req, `inq:${id}`);
  if (!gate.ok) return gate.res;

  return gate.withCookie(NextResponse.json({
    contactType: inquiry.contactType,
    contactValue: inquiry.contactValue,
    customContactLabel: inquiry.customContactLabel,
  }));
}
