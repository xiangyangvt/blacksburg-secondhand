// GET  /api/items/by-contact?value=xxx
//   返回该联系方式下所有 active 商品（公开查询，任何人都能看 —— 联系方式本来就公开）
//
// POST /api/items/by-contact  body { value, editCode }
//   返回 active + 该 editCode 下的 draft（私有，需要识别码验证）
//   用于 G4「我的发布」页查看自己的草稿

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { parsePhotoUrls } from '@/lib/utils';

function serialize(item: any) {
  return {
    ...item,
    photoUrls: parsePhotoUrls(item.photoUrls),
    editCodeHash: undefined,
    cartCount: item._count?.cartEntries ?? 0,  // 真实"在 N 人购物清单"计数（visitor 去重）
    _count: undefined,
  };
}

export async function GET(req: NextRequest) {
  const value = req.nextUrl.searchParams.get('value')?.trim();
  if (!value) return NextResponse.json({ error: 'value 不能为空' }, { status: 400 });

  const items = await prisma.item.findMany({
    where: { contactValue: value, status: 'active' },
    orderBy: { bumpedAt: 'desc' },
    take: 200,
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

  // active 永远返回；draft 仅当 editCode 比对通过才返回
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

  let drafts: typeof all = [];
  if (editCode.length >= 6) {
    // 对每条 draft 比对 hash —— 慢但可控（草稿数有 50 上限）
    const draftCandidates = all.filter(it => it.status === 'draft');
    const matches = await Promise.all(
      draftCandidates.map(async it => (await bcrypt.compare(editCode, it.editCodeHash)) ? it : null)
    );
    drafts = matches.filter((x): x is (typeof all)[number] => x !== null);
  }

  const actives = all.filter(it => it.status === 'active');
  const merged = [...actives, ...drafts];

  return NextResponse.json({
    items: merged.map(serialize),
    activeCount: actives.length,
    draftCount: drafts.length,
  });
}
