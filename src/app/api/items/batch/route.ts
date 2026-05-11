// POST /api/items/batch
// 批量入库为草稿（status=draft）。卖家用批量导入流程时调用。
// 一次最多 30 条；同 IP 累计 draft 不超过 50 条。
// 单事务保证全部成功或全部失败。

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getClientIp, serializePhotoUrls } from '@/lib/utils';
import { validateItemFields } from '@/lib/itemValidation';

const MAX_BATCH = 30;
const MAX_DRAFTS_PER_IP = 50;

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { editCode, items, utmSource } = body;
  const cleanedUtm = typeof utmSource === 'string' && utmSource ? utmSource.slice(0, 64) : null;

  if (typeof editCode !== 'string' || editCode.length < 6) return err('识别码至少 6 位');
  if (!Array.isArray(items) || items.length === 0) return err('items 必须是非空数组');
  if (items.length > MAX_BATCH) return err(`单次最多 ${MAX_BATCH} 条`);

  // 逐条校验（先校验完所有再入库，便于一次性给前端展示错误位置）
  const errors: { index: number; error: string }[] = [];
  items.forEach((it: any, i: number) => {
    const e = validateItemFields(it);
    if (e) errors.push({ index: i, error: e });
  });
  if (errors.length > 0) {
    return NextResponse.json({ error: '部分商品有错', perItem: errors }, { status: 400 });
  }

  const ip = getClientIp(req);
  const existingDrafts = await prisma.item.count({
    where: { ipAddress: ip, status: 'draft' },
  });
  if (existingDrafts + items.length > MAX_DRAFTS_PER_IP) {
    return err(`草稿数会超过 ${MAX_DRAFTS_PER_IP} 上限（当前 ${existingDrafts}，本次 ${items.length}），请先发布或删除一些`, 429);
  }

  // bcrypt 比较慢，所以批量算一次 hash 就好（所有商品共用同一 editCode）
  const editCodeHash = await bcrypt.hash(editCode, 10);
  const now = new Date();

  const created = await prisma.$transaction(
    items.map((it: any) =>
      prisma.item.create({
        data: {
          type: it.type,
          title: it.title.trim(),
          description: (it.description ?? '').trim(),
          price: it.price === null ? null : Math.round(it.price),
          category: it.category,
          customTag: it.customTag?.trim() || null,
          contactType: it.contactType,
          contactValue: it.contactValue.trim(),
          customContactLabel: it.customContactLabel?.trim() || null,
          photoUrls: serializePhotoUrls(it.photoUrls ?? []),
          editCodeHash,
          status: 'draft',
          ipAddress: ip,
          bumpedAt: now,
          utmSource: cleanedUtm,
        },
        select: { id: true },
      })
    )
  );

  return NextResponse.json({
    success: true,
    ids: created.map(c => c.id),
    count: created.length,
  });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
