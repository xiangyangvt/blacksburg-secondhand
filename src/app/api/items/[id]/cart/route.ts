// POST /api/items/[id]/cart  body { action: 'add' | 'remove' }
// 购物清单云端同步：买家本地加/移商品时，server 用 visitorId 维护一份独立去重列表
// 卖家在"我的发布"看到真实的"在 N 人的购物清单"
//
// visitor 用现有的 hb_vid cookie（跟 PageView 共用）；如果没有就生成一个并回写 Set-Cookie

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

const VID_COOKIE = 'hb_vid';
const VID_MAX_AGE = 60 * 60 * 24 * 365;

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const action = body.action;
  if (action !== 'add' && action !== 'remove') {
    return NextResponse.json({ error: 'action 必须是 add 或 remove' }, { status: 400 });
  }

  const item = await prisma.item.findUnique({ where: { id }, select: { status: true } });
  if (!item || (item.status !== 'active' && action === 'add')) {
    // remove 操作即使 item 已下架也允许 —— 用户清理自己 cart
    if (action === 'add') {
      return NextResponse.json({ error: '商品不存在或已下架' }, { status: 404 });
    }
  }

  const existing = req.cookies.get(VID_COOKIE)?.value;
  const visitorId = existing || randomUUID();

  try {
    if (action === 'add') {
      // upsert via try-catch：unique violation 表示已经在车里，忽略即可
      try {
        await prisma.cartEntry.create({ data: { itemId: id, visitorId } });
      } catch {
        // 唯一约束冲突 —— 已经存在，不重复插入
      }
    } else {
      await prisma.cartEntry.deleteMany({ where: { itemId: id, visitorId } });
    }
  } catch {
    // 静默 —— 客户端本地状态不依赖这一次成功
  }

  const res = NextResponse.json({ ok: true });
  if (!existing) {
    res.cookies.set(VID_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: VID_MAX_AGE,
      path: '/',
    });
  }
  return res;
}
