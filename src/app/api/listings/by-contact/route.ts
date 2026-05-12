// 卖家自查 listing：复用 /my 面板的查询模式
//   GET  ?value=xxx        → 公开查询（只 active）
//   POST { value, editCode } → 私有查询（active + 该 editCode 的 draft）

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

function serialize(listing: any) {
  return {
    ...listing,
    photoUrls: parseJsonArray(listing.photoUrls),
    areas:     parseJsonArray(listing.areas),
    editCodeHash: undefined,
  };
}

export async function GET(req: NextRequest) {
  const value = req.nextUrl.searchParams.get('value')?.trim();
  if (!value) return NextResponse.json({ error: 'value 不能为空' }, { status: 400 });

  const listings = await prisma.listing.findMany({
    where: { contactValue: value, status: 'active' },
    orderBy: { bumpedAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ items: listings.map(serialize) });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const value = typeof body.value === 'string' ? body.value.trim() : '';
  const editCode = typeof body.editCode === 'string' ? body.editCode : '';
  if (!value) return NextResponse.json({ error: 'value 不能为空' }, { status: 400 });

  const all = await prisma.listing.findMany({
    where: {
      contactValue: value,
      status: { in: ['active', 'draft'] },
    },
    orderBy: { bumpedAt: 'desc' },
    take: 100,
  });

  let drafts: typeof all = [];
  if (editCode.length >= 6) {
    const draftCandidates = all.filter(l => l.status === 'draft');
    const matches = await Promise.all(
      draftCandidates.map(async l => (await bcrypt.compare(editCode, l.editCodeHash)) ? l : null)
    );
    drafts = matches.filter((x): x is (typeof all)[number] => x !== null);
  }

  const actives = all.filter(l => l.status === 'active');
  const merged = [...actives, ...drafts];

  return NextResponse.json({
    items: merged.map(serialize),
    activeCount: actives.length,
    draftCount: drafts.length,
  });
}

function parseJsonArray(s: string): string[] {
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}
