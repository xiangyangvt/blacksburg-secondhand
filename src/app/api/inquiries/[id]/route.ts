import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

// PATCH /api/inquiries/[id]
// 两种用法：
//   1. 卖家回复 / 改回复：body { itemEditCode, sellerReply }（sellerReply 空字符串 = 撤回回复）
//   2. 买家改自己留言：body { contactValue, message }
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { item: true },
  });
  if (!inquiry) return err('留言不存在', 404);

  // ===== 模式 1：卖家回复 =====
  if (typeof body.itemEditCode === 'string' && typeof body.sellerReply === 'string') {
    const ok = await bcrypt.compare(body.itemEditCode, inquiry.item.editCodeHash);
    if (!ok) return err('识别码错误', 401);

    const reply = body.sellerReply.trim();
    if (reply.length > 500) return err('回复最多 500 字');

    await prisma.inquiry.update({
      where: { id },
      data: {
        sellerReply: reply || null,
        sellerRepliedAt: reply ? new Date() : null,
      },
    });
    return NextResponse.json({ success: true });
  }

  // ===== 模式 2：买家改自己留言 =====
  if (typeof body.message === 'string' && typeof body.contactValue === 'string') {
    const message = body.message.trim();
    if (!message) return err('留言不能为空');
    if (message.length > 500) return err('留言最多 500 字');
    if (inquiry.contactValue.toLowerCase() !== body.contactValue.trim().toLowerCase()) {
      return err('联系方式不匹配，无法编辑他人留言', 401);
    }
    await prisma.inquiry.update({
      where: { id },
      data: { message },
    });
    return NextResponse.json({ success: true });
  }

  return err('参数不正确：需要 (itemEditCode + sellerReply) 或 (contactValue + message)');
}

// DELETE /api/inquiries/[id]
//   方式 1：买家自删（提供 contactValue）
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
