import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CONTACT_TYPES, getClientIp } from '@/lib/utils';

const VALID_CONTACT_TYPES = CONTACT_TYPES.map(c => c.id);

// POST /api/items/[id]/inquiries  发询价
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { contactType, contactValue, customContactLabel, message } = body;

  if (!VALID_CONTACT_TYPES.includes(contactType)) return err('联系方式类型不合法');
  if (typeof contactValue !== 'string' || !contactValue.trim()) return err('联系方式不能为空');
  if (typeof message !== 'string' || !message.trim()) return err('留言不能为空');
  if (message.length > 500) return err('留言最多 500 字');

  // 商品存在检查
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item || item.status !== 'active') return err('商品不存在', 404);

  // 隐式限速：同 IP 1 小时内最多 10 条询价
  const ip = getClientIp(req);
  const recentCount = await prisma.inquiry.count({
    where: { ipAddress: ip, createdAt: { gte: new Date(Date.now() - 3600e3) } },
  });
  if (recentCount >= 10) return err('留言太频繁了，请稍后再试', 429);

  const inquiry = await prisma.inquiry.create({
    data: {
      itemId: id,
      contactType,
      contactValue: contactValue.trim(),
      customContactLabel: customContactLabel?.trim() || null,
      message: message.trim(),
      ipAddress: ip,
    },
  });

  return NextResponse.json({ id: inquiry.id, success: true });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
