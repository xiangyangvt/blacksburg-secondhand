// POST /api/inquiries/[id]/reveal-contact
// 任何访客都可调（无需 auth）。返回留言人的联系方式。
//
// 跟 item 的 reveal 端点的差异：
//   - 不记 contactRevealCount（对留言人本人来说这个数据没有意义；卖家如果要知道有多少人看过自己 item 的所有留言，
//     可以在 item 维度看 contactRevealCount 已经够了）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(_req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;

  const inquiry = await prisma.inquiry.findUnique({ where: { id } });
  if (!inquiry || inquiry.status !== 'active') {
    return NextResponse.json({ error: '留言不存在或已隐藏' }, { status: 404 });
  }

  return NextResponse.json({
    contactType: inquiry.contactType,
    contactValue: inquiry.contactValue,
    customContactLabel: inquiry.customContactLabel,
  });
}
