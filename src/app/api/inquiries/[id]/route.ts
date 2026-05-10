import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

// PATCH /api/inquiries/[id]  改自己的留言（用同一联系方式校验身份）
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { message, contactValue } = body;
  if (typeof message !== 'string' || !message.trim()) return err('留言不能为空');
  if (message.length > 500) return err('留言最多 500 字');
  if (typeof contactValue !== 'string') return err('请提供联系方式校验身份');

  const inquiry = await prisma.inquiry.findUnique({ where: { id } });
  if (!inquiry) return err('留言不存在', 404);

  // 身份校验：必须用同一个联系方式
  if (inquiry.contactValue.toLowerCase() !== contactValue.trim().toLowerCase()) {
    return err('联系方式不匹配，无法编辑他人留言', 401);
  }

  await prisma.inquiry.update({
    where: { id },
    data: { message: message.trim() },
  });
  return NextResponse.json({ success: true });
}

// DELETE /api/inquiries/[id]
//   方式 1：自己删（提供 contactValue）
//   方式 2：卖家清理（提供 itemEditCode）
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const sp = req.nextUrl.searchParams;
  const contactValue = sp.get('contactValue');
  const itemEditCode = sp.get('itemEditCode');

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { item: true },
  });
  if (!inquiry) return err('留言不存在', 404);

  let allowed = false;
  if (contactValue && inquiry.contactValue.toLowerCase() === contactValue.trim().toLowerCase()) {
    allowed = true;
  } else if (itemEditCode) {
    const ok = await bcrypt.compare(itemEditCode, inquiry.item.editCodeHash);
    if (ok) allowed = true;
  }

  if (!allowed) return err('无权删除此留言', 401);

  await prisma.inquiry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
