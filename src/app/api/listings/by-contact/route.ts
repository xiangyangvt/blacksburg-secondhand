// 卖家自查 listing：复用 /my 面板的查询模式
//   GET  ?value=xxx                  → 公开查询（只 active；不含 applications）
//   POST { value, editCode, withApplications? }
//                                    → 私有查询（active + 该 editCode 的 draft）
//     withApplications=true → 每条 listing 额外带 applications 数组（用于"申请收件"）

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

function serialize(listing: any, includeApplications = false) {
  const base = {
    ...listing,
    photoUrls: parseJsonArray(listing.photoUrls),
    areas:     parseJsonArray(listing.areas),
    editCodeHash: undefined,
  };
  if (includeApplications && Array.isArray(listing.applications)) {
    base.applications = listing.applications.map((a: any) => ({
      id: a.id,
      applicantGender: a.applicantGender,
      ageRange: a.ageRange,
      contactType: a.contactType,
      contactValue: a.contactValue,
      customContactLabel: a.customContactLabel,
      message: a.message,
      status: a.status,
      rejectReason: a.rejectReason,
      attachedListingId: a.attachedListingId,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  }
  return base;
}

export async function GET(req: NextRequest) {
  const value = req.nextUrl.searchParams.get('value')?.trim();
  if (!value) return NextResponse.json({ error: 'value 不能为空' }, { status: 400 });

  const listings = await prisma.listing.findMany({
    where: { contactValue: value, status: 'active' },
    orderBy: { bumpedAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ items: listings.map(l => serialize(l)) });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const value = typeof body.value === 'string' ? body.value.trim() : '';
  const editCode = typeof body.editCode === 'string' ? body.editCode : '';
  const withApps = body.withApplications === true;
  if (!value) return NextResponse.json({ error: 'value 不能为空' }, { status: 400 });

  const all = await prisma.listing.findMany({
    where: {
      contactValue: value,
      status: { in: ['active', 'draft'] },
    },
    orderBy: { bumpedAt: 'desc' },
    take: 100,
    include: withApps ? {
      applications: {
        orderBy: { createdAt: 'desc' },
      },
    } : undefined,
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

  // 统计待处理申请数
  let pendingApplicationCount = 0;
  if (withApps) {
    for (const l of merged) {
      const apps = (l as any).applications;
      if (Array.isArray(apps)) {
        pendingApplicationCount += apps.filter((a: any) => a.status === 'pending').length;
      }
    }
  }

  return NextResponse.json({
    items: merged.map(l => serialize(l, withApps)),
    activeCount: actives.length,
    draftCount: drafts.length,
    pendingApplicationCount,
  });
}

function parseJsonArray(s: string): string[] {
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}
