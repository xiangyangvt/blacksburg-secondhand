// 室友 listing 列表 + 创建

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getClientIp, LISTING_TYPES, LISTING_GENDERS } from '@/lib/utils';
import { validateListingFields, normalizeListingFields } from '@/lib/listingValidation';
import { processOverduePendingDeletions } from '@/lib/uploader';

const VALID_TYPES = LISTING_TYPES.map(t => t.id) as string[];
const VALID_GENDERS = LISTING_GENDERS as readonly string[];

// GET /api/listings?type=&canApplyAs=&areas=&budgetMin=&budgetMax=&sort=&q=
export async function GET(req: NextRequest) {
  // 顺手扫一遍 Cloudinary 待删队列
  processOverduePendingDeletions().catch(() => {});

  const sp = req.nextUrl.searchParams;
  const type        = sp.get('type');         // find_roommate | co_rent | sublet | summer
  const canApplyAs  = sp.get('canApplyAs');   // F | M | nb | unspecified
  const areasRaw    = sp.get('areas');        // "Foxridge,Downtown"
  const budgetMin   = sp.get('budgetMin') ? Number(sp.get('budgetMin')) : undefined;
  const budgetMax   = sp.get('budgetMax') ? Number(sp.get('budgetMax')) : undefined;
  const sort        = sp.get('sort') ?? 'newest';
  const q           = sp.get('q')?.trim();

  const where: any = { status: 'active' };
  if (type && VALID_TYPES.includes(type)) where.type = type;

  // canApplyAs：用户希望投这个性别 → listing 的 lookingForGender 必须能容纳
  // canApplyAs=F → lookingForGender IN ('F-only', 'any')
  // canApplyAs=M → lookingForGender IN ('M-only', 'any')
  // canApplyAs=nb/unspecified → lookingForGender = 'any'
  if (canApplyAs && VALID_GENDERS.includes(canApplyAs)) {
    const allowed = canApplyAs === 'F' ? ['F-only', 'any']
                  : canApplyAs === 'M' ? ['M-only', 'any']
                  : ['any'];
    where.lookingForGender = { in: allowed };
  }

  // areas：listing.areas 是 JSON 字符串数组，命中任一即可
  // SQLite/PG 都没法直接 JSON contains 过滤跨方言，先取出来 JS 端过滤
  // （后期数据多可换 PG 原生 String[] + has）
  let needsJsFilter = false;
  let requestedAreas: string[] = [];
  if (areasRaw) {
    requestedAreas = areasRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (requestedAreas.length > 0) needsJsFilter = true;
  }

  // 预算重叠判断（区间相交）：
  //   listing 的 [budgetMin, budgetMax] 和 用户 [reqMin, reqMax] 有交集即匹配
  if (budgetMin !== undefined || budgetMax !== undefined) {
    const reqMin = budgetMin ?? 0;
    const reqMax = budgetMax ?? Number.MAX_SAFE_INTEGER;
    where.AND = [
      { OR: [{ budgetMin: null }, { budgetMin: { lte: reqMax } }] },
      { OR: [{ budgetMax: null }, { budgetMax: { gte: reqMin } }] },
    ];
  }

  if (q) {
    where.OR = [
      { title:       { contains: q } },
      { description: { contains: q } },
    ];
  }

  const orderBy =
    sort === 'oldest'      ? { createdAt: 'asc'  as const } :
    sort === 'budgetAsc'   ? { budgetMin: 'asc'  as const } :
    sort === 'budgetDesc'  ? { budgetMax: 'desc' as const } :
                             { bumpedAt:  'desc' as const };

  const rawListings = await prisma.listing.findMany({
    where,
    orderBy,
    take: 200,
    include: {
      // 只暴露 active 留言；留言内 contactValue 同样 reveal 隐藏（与 item inquiries 一致）
      inquiries: { where: { status: 'active' }, orderBy: { createdAt: 'asc' } },
    },
  });

  // JS 端 areas 过滤（SQLite/PG 跨方言兼容）
  let listings = rawListings;
  if (needsJsFilter) {
    listings = listings.filter(l => {
      try {
        const arr: string[] = JSON.parse(l.areas);
        return arr.some(a => requestedAreas.includes(a));
      } catch {
        return false;
      }
    });
  }

  const serialized = listings.map((l: any) => ({
    ...l,
    photoUrls: parseJsonArray(l.photoUrls),
    areas:     parseJsonArray(l.areas),
    // 不返回这些敏感字段
    editCodeHash:  undefined,
    contactValue:  '',
    contactType:   l.contactType,
    customContactLabel: null,
    ipAddress: undefined,
    // 留言里的联系方式也脱敏（reveal 机制：用户点"查看联系方式"才显示）
    inquiries: (l.inquiries ?? []).map((inq: any) => ({
      ...inq,
      contactValue: '',
      customContactLabel: null,
    })),
  }));

  return NextResponse.json({ items: serialized });
}

// POST /api/listings  创建 listing
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { editCode, status, utmSource, ...rest } = body;
  const desiredStatus: 'active' | 'draft' = status === 'draft' ? 'draft' : 'active';
  const cleanedUtm = typeof utmSource === 'string' && utmSource ? utmSource.slice(0, 64) : null;

  if (typeof editCode !== 'string' || editCode.length < 6) return err('密码至少 6 位');

  const fieldErr = validateListingFields(rest);
  if (fieldErr) return err(fieldErr);

  const ip = getClientIp(req);

  // 限速
  if (desiredStatus === 'active') {
    const recent = await prisma.listing.count({
      where: {
        ipAddress: ip,
        status: 'active',
        createdAt: { gte: new Date(Date.now() - 3600e3) },
      },
    });
    if (recent >= 10) return err('发布太频繁，请 1 小时后再试', 429);
  } else {
    const drafts = await prisma.listing.count({
      where: { ipAddress: ip, status: 'draft' },
    });
    if (drafts >= 50) return err('草稿过多 (≤50)，请先发布或删除', 429);
  }

  const editCodeHash = await bcrypt.hash(editCode, 10);
  const normalized = normalizeListingFields(rest);

  const listing = await prisma.listing.create({
    data: {
      ...normalized,
      editCodeHash,
      status: desiredStatus,
      ipAddress: ip,
      utmSource: cleanedUtm,
    },
  });

  return NextResponse.json({ id: listing.id, status: listing.status, success: true });
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
