// POST /api/items/[id]/reveal-contact
// 纯粹"取联系方式"端点 —— 不再 increment 任何计数（contactRevealCount 已废弃）
// 卖家面板看到的"在 N 人购物清单"由 CartEntry 表 visitor 去重统计，跟这里无关

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(_req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item || item.status !== 'active') {
    return NextResponse.json({ error: '商品不存在或已下架' }, { status: 404 });
  }

  return NextResponse.json({
    contactType: item.contactType,
    contactValue: item.contactValue,
    customContactLabel: item.customContactLabel,
  });
}
