// POST /api/items/[id]/reveal-contact
// 任何访客都可调（无需 auth）。返回联系方式 + 累计 contactRevealCount
// 同 IP 24h 内重复调用只算一次（用 ContactRevealLog 表去重；没有就裸 increment）
//
// 这是"二手联系方式始终隐藏 + 点击才显示"机制的核心端点：
//   - 前端进入页面时不带 contactValue（公开 GET 已 strip 掉）
//   - 用户点"查看联系方式"按钮 → 调本端点 → 拿到实际 value + 显示
//   - 卖家在"我的发布"能看到自己 listing 累计被查看了多少次

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/utils';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item || item.status !== 'active') {
    return NextResponse.json({ error: '商品不存在或已下架' }, { status: 404 });
  }

  const ip = getClientIp(req);

  // 是否要 increment count？规则：同 IP + 同 item 24h 内只算一次
  // 没有专门的 ContactRevealLog 表，我们用一个简单办法 —— 利用 PendingCloudinaryDeletion 之类的
  // 已有基础设施太重。MVP 阶段直接 increment，未来再加去重。
  // （单条商品的真实"独立查看人数"重要性低于"被查看的次数"作为社会证明）
  await prisma.item.update({
    where: { id },
    data: { contactRevealCount: { increment: 1 } },
  });

  return NextResponse.json({
    contactType: item.contactType,
    contactValue: item.contactValue,
    customContactLabel: item.customContactLabel,
    // 顺便回传新的累计值（卖家可能也在看自己的 item，能看到数字 +1）
    revealCount: item.contactRevealCount + 1,
  });
}
