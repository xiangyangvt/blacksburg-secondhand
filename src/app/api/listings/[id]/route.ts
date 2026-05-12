// PATCH 编辑 / DELETE 软删 单条 listing（需识别码）

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { validateListingFields, normalizeListingFields } from '@/lib/listingValidation';
import { schedulePendingCloudinaryDeletion } from '@/lib/uploader';

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { editCode, ...updates } = body;
  if (typeof editCode !== 'string') return err('请提供识别码');

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || (listing.status !== 'active' && listing.status !== 'draft')) {
    return err('listing 不存在或已下架', 404);
  }

  const ok = await bcrypt.compare(editCode, listing.editCodeHash);
  if (!ok) return err('识别码错误', 401);

  // 完整字段校验（PATCH 允许部分字段，但每个传入的字段都要合法）
  // 这里采取的策略：合并旧值 + 新值后整体校验
  const merged = {
    ...listing,
    ...updates,
    photoUrls: updates.photoUrls ?? parseJsonArray(listing.photoUrls),
    areas:     updates.areas     ?? parseJsonArray(listing.areas),
  };
  const fieldErr = validateListingFields(merged);
  if (fieldErr) return err(fieldErr);

  // 实质性更新才 bump：title/description/photo/budget/area/lifestyle 变了算
  const SUBSTANTIVE = [
    'title', 'description', 'photoUrls', 'type',
    'budgetMin', 'budgetMax', 'areas', 'moveInStart', 'moveInEnd',
    'sleepSchedule', 'cleanliness', 'social', 'smoking', 'drinking', 'pets', 'guests',
  ];
  const hasSubstantive = SUBSTANTIVE.some(k => updates[k] !== undefined);

  const data: any = normalizeListingFields(merged);
  if (hasSubstantive) data.bumpedAt = new Date();

  await prisma.listing.update({ where: { id }, data });

  // 换图 → 旧图入 24h 待删队列
  if (updates.photoUrls !== undefined) {
    const oldUrls = parseJsonArray(listing.photoUrls);
    const newUrls: string[] = Array.isArray(updates.photoUrls) ? updates.photoUrls : [];
    const removed = oldUrls.filter(u => !newUrls.includes(u));
    if (removed.length > 0) schedulePendingCloudinaryDeletion(removed).catch(() => {});
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const sp = req.nextUrl.searchParams;
  const editCode = sp.get('editCode') ?? '';
  if (!editCode) return err('请提供识别码');

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.status === 'deleted') return err('listing 不存在', 404);

  const ok = await bcrypt.compare(editCode, listing.editCodeHash);
  if (!ok) return err('识别码错误', 401);

  await prisma.listing.update({ where: { id }, data: { status: 'deleted' } });

  // 软删时把图入 24h 待删队列；本地 /uploads/ 不动
  const urls = parseJsonArray(listing.photoUrls);
  schedulePendingCloudinaryDeletion(urls).catch(() => {});

  // 同时把所有 pending application 取消
  await prisma.application.updateMany({
    where: { listingId: id, status: 'pending' },
    data: { status: 'cancelled' },
  });

  return NextResponse.json({ success: true });
}

function parseJsonArray(s: string): string[] {
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
