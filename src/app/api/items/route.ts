import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  CATEGORIES,
  CONTACT_TYPES,
  getClientIp,
  serializePhotoUrls,
  parsePhotoUrls,
} from '@/lib/utils';

const VALID_CATEGORIES = CATEGORIES.map(c => c.id);
const VALID_CONTACT_TYPES = CONTACT_TYPES.map(c => c.id);

// GET /api/items?type=&category=&q=&minPrice=&maxPrice=&since=&sort=
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type     = sp.get('type');     // sell | buy | null(全部)
  const category = sp.get('category'); // home/electronics/...
  const q        = sp.get('q')?.trim();
  const minPrice = sp.get('minPrice') ? Number(sp.get('minPrice')) : undefined;
  const maxPrice = sp.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined;
  const since    = sp.get('since');    // 1d | 1w | 1m | all
  const sort     = sp.get('sort') ?? 'newest'; // newest | oldest | priceAsc | priceDesc

  const where: any = { status: 'active' };
  if (type === 'sell' || type === 'buy') where.type = type;
  if (category && VALID_CATEGORIES.includes(category as any)) where.category = category;
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

  const orderBy =
    sort === 'oldest'    ? { createdAt: 'asc'  as const } :
    sort === 'priceAsc'  ? { price:     'asc'  as const } :
    sort === 'priceDesc' ? { price:     'desc' as const } :
                           { createdAt: 'desc' as const };

  const items = await prisma.item.findMany({
    where,
    orderBy,
    take: 200,
    include: {
      inquiries: { orderBy: { createdAt: 'asc' } },
    },
  });

  const serialized = items.map(it => ({
    ...it,
    photoUrls: parsePhotoUrls(it.photoUrls),
    editCodeHash: undefined, // 别返回 hash
  }));

  return NextResponse.json({ items: serialized });
}

// POST /api/items  创建商品
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const {
    type, title, description, price, category, customTag,
    contactType, contactValue, customContactLabel,
    photoUrls, editCode,
  } = body;

  // 校验
  if (type !== 'sell' && type !== 'buy') return err('类型必须是 sell 或 buy');
  if (typeof title !== 'string' || !title.trim()) return err('标题不能为空');
  if (title.length > 100) return err('标题最多 100 字');
  if (typeof description !== 'string' || description.length > 2000) return err('描述最多 2000 字');
  if (price !== null && (typeof price !== 'number' || price < 0 || price > 1_000_000)) return err('价格不合法');
  if (!VALID_CATEGORIES.includes(category)) return err('分类不合法');
  if (!VALID_CONTACT_TYPES.includes(contactType)) return err('联系方式类型不合法');
  if (typeof contactValue !== 'string' || !contactValue.trim()) return err('联系方式不能为空');
  if (!Array.isArray(photoUrls) || photoUrls.length > 6) return err('图片最多 6 张');
  if (typeof editCode !== 'string' || editCode.length < 6) return err('识别码至少 6 位');

  // 隐式限速：同 IP 1 小时内最多 10 条
  const ip = getClientIp(req);
  const recentCount = await prisma.item.count({
    where: { ipAddress: ip, createdAt: { gte: new Date(Date.now() - 3600e3) } },
  });
  if (recentCount >= 10) return err('发布太频繁了，请 1 小时后再试', 429);

  const editCodeHash = await bcrypt.hash(editCode, 10);

  const item = await prisma.item.create({
    data: {
      type,
      title: title.trim(),
      description: description.trim(),
      price: price === null ? null : Math.round(price),
      category,
      customTag: customTag?.trim() || null,
      contactType,
      contactValue: contactValue.trim(),
      customContactLabel: customContactLabel?.trim() || null,
      photoUrls: serializePhotoUrls(photoUrls),
      editCodeHash,
      ipAddress: ip,
    },
  });

  return NextResponse.json({
    id: item.id,
    success: true,
  });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
