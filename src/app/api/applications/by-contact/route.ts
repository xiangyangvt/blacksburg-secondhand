// POST /api/applications/by-contact
// 申请人 B 查自己发出的所有申请的当前状态
// body { value, editCode? }
//   value     = 申请时填的联系方式
//   editCode  = 申请时设的识别码（不传也能查，但只看到 contact 一致的所有申请，不能精确到自己；建议传）

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const value = typeof body.value === 'string' ? body.value.trim() : '';
  const editCode = typeof body.editCode === 'string' ? body.editCode : '';
  if (!value) return NextResponse.json({ error: 'value 不能为空' }, { status: 400 });

  const candidates = await prisma.application.findMany({
    where: { contactValue: value },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      // 一并带上目标 listing 的标题/类型，让前端可显示"申请的是哪条"
      listing: { select: {
        id: true, type: true, title: true,
        posterGender: true, ageRange: true,
        // approved 后才透出来：把它丢给前端，前端按 status 决定显不显示
        contactType: true, contactValue: true, customContactLabel: true,
      } },
    },
  });

  // 如果提供了 editCode，只返回 hash 比对通过的（精确到自己发的）
  let mine = candidates;
  if (editCode.length >= 6) {
    const matched = await Promise.all(
      candidates.map(async a => (await bcrypt.compare(editCode, a.editCodeHash)) ? a : null)
    );
    mine = matched.filter((x): x is (typeof candidates)[number] => x !== null);
  }

  // 序列化：approved 后才把对方 contact 露出来，否则擦掉
  const serialized = mine.map(a => ({
    id: a.id,
    listingId: a.listingId,
    listing: {
      id: a.listing.id,
      type: a.listing.type,
      title: a.listing.title,
      posterGender: a.listing.posterGender,
      ageRange: a.listing.ageRange,
      // approved 才透出来
      contactType:  a.status === 'approved' ? a.listing.contactType : null,
      contactValue: a.status === 'approved' ? a.listing.contactValue : null,
      customContactLabel: a.status === 'approved' ? a.listing.customContactLabel : null,
    },
    message: a.message,
    status: a.status,
    rejectReason: a.rejectReason,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  return NextResponse.json({
    items: serialized,
    counts: {
      pending:   serialized.filter(a => a.status === 'pending').length,
      approved:  serialized.filter(a => a.status === 'approved').length,
      rejected:  serialized.filter(a => a.status === 'rejected').length,
      cancelled: serialized.filter(a => a.status === 'cancelled').length,
    },
  });
}
