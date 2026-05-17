// POST /api/items/[id]/publish
// 把一条 draft 状态的商品转成 active（正式发布）
// 走和正常发布一样的限速规则（1h 内 active 不超过 10 条）

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/utils';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { editCode } = body;
  if (typeof editCode !== 'string') return err('请提供密码');

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) return err('商品不存在', 404);
  if (item.status === 'active') return err('已经是上架状态，无需重复发布');
  if (item.status !== 'draft') return err('只能发布草稿状态的商品');

  const ok = await bcrypt.compare(editCode, item.editCodeHash);
  if (!ok) return err('密码错误', 401);

  // 限速：和单条发布一样
  const ip = getClientIp(req);
  const recentActive = await prisma.item.count({
    where: {
      ipAddress: ip,
      status: 'active',
      createdAt: { gte: new Date(Date.now() - 3600e3) },
    },
  });
  if (recentActive >= 10) return err('发布太频繁了，请 1 小时后再试', 429);

  // 转 active；bumpedAt 取当前，让列表把它排到最新位置
  await prisma.item.update({
    where: { id },
    data: { status: 'active', bumpedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
