// PATCH / DELETE inquiry —— 同时支持 item 来源 + listing 来源
// 鉴权：发布人用 itemEditCode 或 listingEditCode；留言人用 contactValue

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { item: true, listing: true },
  });
  if (!inquiry) return err('留言不存在', 404);

  // ===== 模式 1：发布人回复 =====
  // 两个字段名：itemEditCode（item 来源）或 listingEditCode（listing 来源）
  const replyCode = body.itemEditCode ?? body.listingEditCode;
  if (typeof replyCode === 'string' && typeof body.sellerReply === 'string') {
    const targetHash = inquiry.item?.editCodeHash ?? inquiry.listing?.editCodeHash;
    if (!targetHash) return err('父对象不存在', 404);
    const ok = await bcrypt.compare(replyCode, targetHash);
    if (!ok) return err('密码错误', 401);

    const reply = body.sellerReply.trim();
    if (reply.length > 500) return err('回复最多 500 字');

    await prisma.inquiry.update({
      where: { id },
      data: {
        sellerReply: reply || null,
        sellerRepliedAt: reply ? new Date() : null,
      },
    });

    // 回复 = 父对象活跃，bump
    if (inquiry.itemId) {
      await prisma.item.update({ where: { id: inquiry.itemId }, data: { bumpedAt: new Date() } });
    } else if (inquiry.listingId) {
      await prisma.listing.update({ where: { id: inquiry.listingId }, data: { bumpedAt: new Date() } });
    }

    return NextResponse.json({ success: true });
  }

  // ===== 模式 2：留言人改自己留言（contactValue 匹配）=====
  if (typeof body.message === 'string' && typeof body.contactValue === 'string') {
    const message = body.message.trim();
    if (!message) return err('留言不能为空');
    if (message.length > 500) return err('留言最多 500 字');
    if (inquiry.contactValue.toLowerCase() !== body.contactValue.trim().toLowerCase()) {
      return err('联系方式不匹配，无法编辑他人留言', 401);
    }
    await prisma.inquiry.update({ where: { id }, data: { message } });
    return NextResponse.json({ success: true });
  }

  return err('参数不正确：需要 (itemEditCode/listingEditCode + sellerReply) 或 (contactValue + message)');
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const sp = req.nextUrl.searchParams;
  const contactValue = sp.get('contactValue');
  const itemEditCode = sp.get('itemEditCode');
  const listingEditCode = sp.get('listingEditCode');

  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { item: true, listing: true },
  });
  if (!inquiry) return err('留言不存在', 404);

  let allowed = false;
  if (contactValue && inquiry.contactValue.toLowerCase() === contactValue.trim().toLowerCase()) {
    allowed = true;
  } else if (itemEditCode && inquiry.item) {
    const ok = await bcrypt.compare(itemEditCode, inquiry.item.editCodeHash);
    if (ok) allowed = true;
  } else if (listingEditCode && inquiry.listing) {
    const ok = await bcrypt.compare(listingEditCode, inquiry.listing.editCodeHash);
    if (ok) allowed = true;
  }

  if (!allowed) return err('无权删除此留言', 401);

  await prisma.inquiry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
