// POST /api/items/[id]/reveal-contact
// 卖家联系方式的唯一下发口(Sprint 9A):列表 GET 与 item 页 SSR 不再携带联系方式,
// 客户端展开卡片时调这里逐条取。经 gateReveal 配额(见 src/lib/contactQuota.ts)。
// 不 increment 任何计数(contactRevealCount 已废弃);「在 N 人心愿单」由 CartEntry 统计。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gateReveal } from '@/lib/contactQuota';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;

  const item = await prisma.item.findUnique({
    where: { id },
    select: { status: true, contactType: true, contactValue: true, customContactLabel: true },
  });
  if (!item || item.status !== 'active') {
    return NextResponse.json({ error: '商品不存在或已下架' }, { status: 404 });
  }

  const gate = await gateReveal(req, `item:${id}`);
  if (!gate.ok) return gate.res;

  return gate.withCookie(NextResponse.json({
    contactType: item.contactType,
    contactValue: item.contactValue,
    customContactLabel: item.customContactLabel,
  }));
}
