// 室友 listing 列表 + 创建

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getClientIp, LISTING_TYPES, LISTING_GENDERS } from '@/lib/utils';
import { validateListingFields, normalizeListingFields } from '@/lib/listingValidation';
import { processOverduePendingDeletions } from '@/lib/uploader';
import {
  parseListingsQuery, buildListingsWhere, listingsOrderBy, filterListingsByAreas, serializePublicListing, LISTING_LIST_INCLUDE,
} from '@/lib/listingsQuery';
import { scheduleEmbed } from '@/lib/search/indexer';

const VALID_TYPES = LISTING_TYPES.map(t => t.id) as string[];
const VALID_GENDERS = LISTING_GENDERS as readonly string[];

// GET /api/listings?type=&canApplyAs=&areas=&budgetMin=&budgetMax=&sort=&q=
// Sprint 10B-2:解析 / where / orderBy / areas 过滤 / 序列化都在 lib/listingsQuery.ts,与 GET /api/search?site=listings 共用;语义逐字不变
export async function GET(req: NextRequest) {
  // 顺手扫一遍 Cloudinary 待删队列
  processOverduePendingDeletions().catch(() => {});

  const qy = parseListingsQuery(req.nextUrl.searchParams);
  const rawListings = await prisma.listing.findMany({
    where: buildListingsWhere(qy),
    orderBy: listingsOrderBy(qy.sort),
    take: 200,
    include: LISTING_LIST_INCLUDE,
  });
  const listings = filterListingsByAreas(rawListings, qy.areas);

  return NextResponse.json({ items: listings.map(serializePublicListing) });
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

  scheduleEmbed('listing', listing.id); // Sprint 10A

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
