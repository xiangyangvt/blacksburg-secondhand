// 二手列表查询的共用部分(Sprint 10B 从 api/items/route.ts 抽出,GET /api/items 与 GET /api/search 共用,不复制)
//
// 语义与抽出前逐字一致:同一组参数,第 0 层(关键词)结果必须和改动前相同(spec 10B 验收)。
// 这里只放纯函数 + 一个查卖家的 async helper;prisma 调用留在 route 里。

import { CATEGORIES, parsePhotoUrls } from '@/lib/utils';

const VALID_CATEGORIES = CATEGORIES.map(c => c.id) as readonly string[];

export type ItemsSort = 'newest' | 'oldest' | 'priceAsc' | 'priceDesc';

export interface ItemsQuery {
  type?: 'sell' | 'buy';
  category?: string;
  q?: string;
  /** 9A:按「与某 item 同卖家」过滤,传 item id */
  sameSellerAs?: string;
  minPrice?: number;
  maxPrice?: number;
  since?: '1d' | '1w' | '1m';
  sort: ItemsSort;
}

/** URL 参数 → 结构化查询。未知 / 非法值退到默认,与旧 route 行为一致 */
export function parseItemsQuery(sp: URLSearchParams): ItemsQuery {
  const type = sp.get('type');
  const category = sp.get('category');
  const q = sp.get('q')?.trim();
  const sameSellerAs = sp.get('sameSellerAs')?.trim();
  const minPrice = sp.get('minPrice') ? Number(sp.get('minPrice')) : undefined;
  const maxPrice = sp.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined;
  const since = sp.get('since');
  const sort = sp.get('sort') ?? 'newest';
  return {
    type: type === 'sell' || type === 'buy' ? type : undefined,
    category: category && VALID_CATEGORIES.includes(category) && category !== 'housing' ? category : undefined,
    q: q || undefined,
    sameSellerAs: sameSellerAs || undefined,
    minPrice,
    maxPrice,
    since: since === '1d' || since === '1w' || since === '1m' ? since : undefined,
    sort: sort === 'oldest' || sort === 'priceAsc' || sort === 'priceDesc' ? sort : 'newest',
  };
}

export interface WhereOpts {
  /** 是否加关键词 OR 子句。语义路(10B)用同样的过滤条件但不带关键词 */
  includeKeyword?: boolean;
  /** resolveSellerContact 的结果;传了就按卖家过滤 */
  sellerContact?: string;
  now?: () => number;
}

/** Prisma where。纯函数,方便单测 */
export function buildItemsWhere(qy: ItemsQuery, opts: WhereOpts = {}): any {
  // 排除 housing 类目 —— 已经被 Sprint 4 迁到独立的"室友&转租"平台
  // 老用户的 housing item 行还在 Item 表里,但前端不再展示
  const where: any = { status: 'active', NOT: { category: 'housing' } };
  if (qy.type) where.type = qy.type;
  if (qy.category) where.category = qy.category;
  if (opts.sellerContact !== undefined) where.contactValue = opts.sellerContact;
  if (qy.q && opts.includeKeyword !== false) {
    // 搜索匹配标题、描述、自定义标签
    // 不再匹配 contactValue —— 联系方式现在隐藏,搜索它会反推泄露
    where.OR = [
      { title:        { contains: qy.q } },
      { description:  { contains: qy.q } },
      { customTag:    { contains: qy.q } },
    ];
  }
  if (qy.minPrice !== undefined || qy.maxPrice !== undefined) {
    where.price = {};
    if (qy.minPrice !== undefined && !isNaN(qy.minPrice)) where.price.gte = qy.minPrice;
    if (qy.maxPrice !== undefined && !isNaN(qy.maxPrice)) where.price.lte = qy.maxPrice;
  }
  if (qy.since) {
    const now = (opts.now ?? Date.now)();
    const ms = qy.since === '1d' ? 86400e3 : qy.since === '1w' ? 7 * 86400e3 : 30 * 86400e3;
    where.createdAt = { gte: new Date(now - ms) };
  }
  return where;
}

// "最新"语义是"最近活跃":sort=newest 按 bumpedAt 排序
// bumpedAt 在创建时 = createdAt,在实质性编辑 / 新询价 / 卖家回复时刷新
export function itemsOrderBy(sort: ItemsSort) {
  return sort === 'oldest'    ? { createdAt: 'asc'  as const } :
         sort === 'priceAsc'  ? { price:     'asc'  as const } :
         sort === 'priceDesc' ? { price:     'desc' as const } :
                                { bumpedAt:  'desc' as const };
}

/** 列表 include:只暴露 active 状态的留言;hidden 的(3 个 IP 举报后自动隐藏)仅 admin 可见 */
export const ITEM_LIST_INCLUDE = {
  inquiries: {
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

/** 9A:用 item id 反查卖家联系方式。undefined = 未请求;null = 锚点不存在或已下架(列表应返空) */
export async function resolveSellerContact(
  sameSellerAs: string | undefined,
  db: { item: { findUnique(args: { where: { id: string }; select: { contactValue: true; status: true } }): Promise<{ contactValue: string; status: string } | null> } },
): Promise<string | null | undefined> {
  if (!sameSellerAs) return undefined;
  const anchor = await db.item.findUnique({ where: { id: sameSellerAs }, select: { contactValue: true, status: true } });
  if (!anchor || anchor.status !== 'active') return null;
  return anchor.contactValue;
}

/**
 * 公开列表的序列化(白名单思路的"手写 undefined"版,与 9A 后行为一致):
 * 不带 editCodeHash / ipAddress / utmSource / 联系方式;留言对象同样脱敏。
 */
export function serializePublicItem(it: any) {
  return {
    ...it,
    photoUrls: parsePhotoUrls(it.photoUrls),
    editCodeHash: undefined,
    ipAddress: undefined,
    utmSource: undefined,
    embeddingJson: undefined,
    embeddedAt: undefined,
    embedVersion: undefined,
    // Sprint 9A:公开列表不携带联系方式(不变量 ARCHITECTURE.md §8.10)。
    // 展开卡片时客户端调 POST /api/items/[id]/reveal-contact 逐条取,经配额。contactType 不敏感,保留供占位渲染。
    contactValue: '',
    customContactLabel: null,
    inquiries: (it.inquiries ?? []).map((inq: any) => ({
      id: inq.id, itemId: inq.itemId, listingId: inq.listingId, contactType: inq.contactType,
      message: inq.message, sellerReply: inq.sellerReply, sellerRepliedAt: inq.sellerRepliedAt,
      status: inq.status, createdAt: inq.createdAt, updatedAt: inq.updatedAt,
      contactValue: '',
      customContactLabel: null,
    })),
  };
}
