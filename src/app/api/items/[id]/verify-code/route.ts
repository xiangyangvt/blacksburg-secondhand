// POST /api/items/[id]/verify-code
// 纯校验端点：body { editCode } → { valid: boolean }
// 用途：编辑流程在打开编辑表单前先验证，避免"错码也能进编辑界面"

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ valid: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { editCode } = body;
  if (typeof editCode !== 'string' || !editCode) {
    return NextResponse.json({ valid: false, error: '请输入密码' }, { status: 400 });
  }

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item || (item.status !== 'active' && item.status !== 'draft')) {
    return NextResponse.json({ valid: false, error: '商品不存在' }, { status: 404 });
  }

  const ok = await bcrypt.compare(editCode, item.editCodeHash);
  if (!ok) {
    return NextResponse.json({ valid: false, error: '密码错误' }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
