// POST /api/listings/[id]/publish — 草稿 → active

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

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) return err('listing 不存在', 404);
  if (listing.status === 'active') return err('已经是上架状态');
  if (listing.status !== 'draft')  return err('只能发布草稿状态');

  const ok = await bcrypt.compare(editCode, listing.editCodeHash);
  if (!ok) return err('密码错误', 401);

  const ip = getClientIp(req);
  const recent = await prisma.listing.count({
    where: {
      ipAddress: ip,
      status: 'active',
      createdAt: { gte: new Date(Date.now() - 3600e3) },
    },
  });
  if (recent >= 10) return err('发布太频繁，请 1 小时后再试', 429);

  await prisma.listing.update({
    where: { id },
    data: { status: 'active', bumpedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
