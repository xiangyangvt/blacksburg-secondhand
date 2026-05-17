// GET  /api/items/by-contact?value=xxx&excludeId=yyy&limit=N
//   返回该联系方式下所有 active 商品（公开查询，任何人都能看 —— 联系方式本来就公开）
//   - excludeId（可选）：排除某商品 id（UX-13 "同卖家其他物品曝光" 用，排除当前正加入心愿单的商品）
//   - limit（可选，默认 200，上限 200）：cap 数量
//
// POST /api/items/by-contact  body { value, editCode }
//   私有查询：必须提供 editCode (≥6 位)，只返回该 editCode 精确匹配的 active + draft
//   "联系方式 + 密码" 一起作为身份凭证。仅知道联系方式不能看到对方的发布
//   用于「我的」页面 lookup

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { parsePhotoUrls } from '@/lib/utils';

function serialize(item: any) {
  return {
    ...item,
    photoUrls: parsePhotoUrls(item.photoUrls),
    editCodeHash: undefined,
    cartCount: item._count?.cartEntries ?? 0,  // 真实"在 N 人心愿单"计数（visitor 去重）
    _count: undefined,
  };
}

export async function GET(req: NextRequest) {
  const value = req.nextUrl.searchParams.get('value')?.trim();
  const excludeId = req.nextUrl.searchParams.get('excludeId')?.trim() || null;
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 200, 1), 200) : 200;

  if (!value) return NextResponse.json({ error: 'value 不能为空' }, { status: 400 });

  const items = await prisma.item.findMany({
    where: {
      contactValue: value,
      status: 'active',
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { bumpedAt: 'desc' },
    take: limit,
    include: {
      inquiries: { where: { status: 'active' }, orderBy: { createdAt: 'asc' } },
      _count: { select: { cartEntries: true } },
    },
  });

  return NextResponse.json({ items: items.map(serialize) });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const value = typeof body.value === 'string' ? body.value.trim() : '';
  const editCode = typeof body.editCode === 'string' ? body.editCode : '';
  if (!value) return NextResponse.json({ error: 'value 不能为空' }, { status: 400 });
  if (editCode.length < 6) {
    return NextResponse.json({ error: '请输入密码（≥6 位）' }, { status: 401 });
  }

  // 强校验:必须密码 hash 精确匹配,active+draft 都按密码过滤
  // "联系方式 + 密码" 一起作为身份凭证 —— 仅知道联系方式不能看到对方发布
  const all = await prisma.item.findMany({
    where: {
      contactValue: value,
      status: { in: ['active', 'draft'] },
    },
    orderBy: { bumpedAt: 'desc' },
    take: 200,
    include: {
      inquiries: { where: { status: 'active' }, orderBy: { createdAt: 'asc' } },
      _count: { select: { cartEntries: true } },
    },
  });

  // 对每条比对 hash —— 慢但可控（合理上限内）
  const matched = await Promise.all(
    all.map(async it => (await bcrypt.compare(editCode, it.editCodeHash)) ? it : null)
  );
  const mine = matched.filter((x): x is (typeof all)[number] => x !== null);

  const actives = mine.filter(it => it.status === 'active');
  const drafts  = mine.filter(it => it.status === 'draft');

  return NextResponse.json({
    items: [...actives, ...drafts].map(serialize),
    activeCount: actives.length,
    draftCount: drafts.length,
  });
}
