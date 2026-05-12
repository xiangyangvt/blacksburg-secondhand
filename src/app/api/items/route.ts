import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  CATEGORIES,
  getClientIp,
  serializePhotoUrls,
  parsePhotoUrls,
} from '@/lib/utils';
import { validateItemFields } from '@/lib/itemValidation';
import { processOverduePendingDeletions } from '@/lib/uploader';

const VALID_CATEGORIES = CATEGORIES.map(c => c.id);

// GET /api/items?type=&category=&q=&minPrice=&maxPrice=&since=&sort=
export async function GET(req: NextRequest) {
  // 机会式触发：每次 GET 时顺手扫一遍 Cloudinary 待删队列。fire-and-forget，不阻塞主响应
  processOverduePendingDeletions().catch(() => {});

  const sp = req.nextUrl.searchParams;
  const type     = sp.get('type');     // sell | buy | null(全部)
  const category = sp.get('category'); // home/electronics/...
  const q        = sp.get('q')?.trim();
  const minPrice = sp.get('minPrice') ? Number(sp.get('minPrice')) : undefined;
  const maxPrice = sp.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined;
  const since    = sp.get('since');    // 1d | 1w | 1m | all
  const sort     = sp.get('sort') ?? 'newest'; // newest | oldest | priceAsc | priceDesc

  // 排除 housing 类目 —— 已经被 Sprint 4 迁到独立的"室友&转租"平台
  // 老用户的 housing item 行还在 Item 表里，但前端不再展示
  const where: any = { status: 'active', NOT: { category: 'housing' } };
  if (type === 'sell' || type === 'buy') where.type = type;
  if (category && VALID_CATEGORIES.includes(category as any) && category !== 'housing') where.category = category;
  if (q) {
    // 搜索匹配标题、描述、自定义标签、联系方式
    // ⚠️ 故意不匹配识别码 hash —— 那是密码，不能成为搜索目标
    where.OR = [
      { title:        { contains: q } },
      { description:  { contains: q } },
      { customTag:    { contains: q } },
      { contactValue: { contains: q } },
    ];
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {};
    if (minPrice !== undefined && !isNaN(minPrice)) where.price.gte = minPrice;
    if (maxPrice !== undefined && !isNaN(maxPrice)) where.price.lte = maxPrice;
  }
  if (since && since !== 'all') {
    const now = Date.now();
    const ms = since === '1d' ? 86400e3 : since === '1w' ? 7 * 86400e3 : 30 * 86400e3;
    where.createdAt = { gte: new Date(now - ms) };
  }

  // "最新"语义改成"最近活跃"：sort=newest 现在按 bumpedAt 排序
  // bumpedAt 在创建时 = createdAt，在实质性编辑 / 新询价 / 卖家回复时刷新
  const orderBy =
    sort === 'oldest'    ? { createdAt: 'asc'  as const } :
    sort === 'priceAsc'  ? { price:     'asc'  as const } :
    sort === 'priceDesc' ? { price:     'desc' as const } :
                           { bumpedAt:  'desc' as const };

  const items = await prisma.item.findMany({
    where,
    orderBy,
    take: 200,
    include: {
      // 只暴露 active 状态的留言；hidden 的（3 个 IP 举报后自动隐藏）仅 admin 可见
      inquiries: {
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const serialized = items.map(it => ({
    ...it,
    photoUrls: parsePhotoUrls(it.photoUrls),
    editCodeHash: undefined, // 别返回 hash
  }));

  return NextResponse.json({ items: serialized });
}

// POST /api/items  创建商品（可选 status: "active" | "draft"，默认 active）
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { editCode, status, utmSource, ...rest } = body;
  const desiredStatus: 'active' | 'draft' = status === 'draft' ? 'draft' : 'active';
  const cleanedUtm = typeof utmSource === 'string' && utmSource ? utmSource.slice(0, 64) : null;

  if (typeof editCode !== 'string' || editCode.length < 6) return err('识别码至少 6 位');

  const fieldErr = validateItemFields(rest);
  if (fieldErr) return err(fieldErr);

  const ip = getClientIp(req);

  // 限速：active 走 1h 10 条；draft 走 IP 待发草稿不超过 50 条（防止滥用图床/数据库）
  if (desiredStatus === 'active') {
    const recentActive = await prisma.item.count({
      where: {
        ipAddress: ip,
        status: 'active',
        createdAt: { gte: new Date(Date.now() - 3600e3) },
      },
    });
    if (recentActive >= 10) return err('发布太频繁了，请 1 小时后再试', 429);
  } else {
    const draftCount = await prisma.item.count({
      where: { ipAddress: ip, status: 'draft' },
    });
    if (draftCount >= 50) return err('草稿太多（≤50 条），请先发布或删除一些', 429);
  }

  const editCodeHash = await bcrypt.hash(editCode, 10);

  const item = await prisma.item.create({
    data: {
      type: rest.type,
      title: rest.title.trim(),
      description: (rest.description ?? '').trim(),
      price: rest.price === null ? null : Math.round(rest.price),
      category: rest.category,
      customTag: rest.customTag?.trim() || null,
      contactType: rest.contactType,
      contactValue: rest.contactValue.trim(),
      customContactLabel: rest.customContactLabel?.trim() || null,
      photoUrls: serializePhotoUrls(rest.photoUrls),
      editCodeHash,
      status: desiredStatus,
      ipAddress: ip,
      utmSource: cleanedUtm,
    },
  });

  return NextResponse.json({
    id: item.id,
    status: item.status,
    success: true,
  });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
