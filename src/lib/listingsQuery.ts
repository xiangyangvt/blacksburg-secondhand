// 室友 listing 公开列表的序列化(白名单)。
//
// 2026-09-18 修复:GET /api/listings 之前把每条留言 `...inq` 整行 spread 出去,只抹了联系方式,
// 留言人的 ipAddress / utmSource 会随公开列表下发(线上实测 3 条留言带非空 IP)——违反 ARCHITECTURE §2「IP 私有,永不出网」
// 与 §8.3「序列化优先白名单」。9A 修了二手(items)那一侧,室友这一侧漏了。
// 这里与 lib/itemsQuery.ts 的 serializePublicItem 同一口径:留言只给前端用得到的字段。

import { LISTING_TYPES, LISTING_GENDERS } from '@/lib/utils';

function parseJsonArray(s: unknown): string[] {
  if (typeof s !== 'string') return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 留言对象白名单:联系方式走 inquiries/[id]/reveal-contact 逐条取;IP / utm 永不出网 */
export function serializePublicInquiry(inq: any) {
  return {
    id: inq.id, itemId: inq.itemId, listingId: inq.listingId, contactType: inq.contactType,
    message: inq.message, sellerReply: inq.sellerReply, sellerRepliedAt: inq.sellerRepliedAt,
    status: inq.status, createdAt: inq.createdAt, updatedAt: inq.updatedAt,
    contactValue: '',
    customContactLabel: null,
  };
}

/** listing 行:字段多(生活习惯等都要展示),沿用"spread + 显式抹掉私有字段"的写法,留言走白名单 */
export function serializePublicListing(l: any) {
  return {
    ...l,
    photoUrls: parseJsonArray(l.photoUrls),
    areas: parseJsonArray(l.areas),
    // 私有字段:凭证、IP、渠道归因、向量相关
    editCodeHash: undefined,
    ipAddress: undefined,
    utmSource: undefined,
    embeddingJson: undefined,
    embeddedAt: undefined,
    embedVersion: undefined,
    // 9A:公开列表不携带联系方式;contactType 不敏感,保留供占位渲染
    contactValue: '',
    contactType: l.contactType,
    customContactLabel: null,
    inquiries: (l.inquiries ?? []).map(serializePublicInquiry),
  };
}

// ===== Sprint 10B-2:列表查询的共用部分(GET /api/listings 与 GET /api/search?site=listings 共用,语义与抽出前逐字一致) =====


const VALID_TYPES = LISTING_TYPES.map(t => t.id) as string[];
const VALID_GENDERS = LISTING_GENDERS as readonly string[];

export type ListingsSort = 'newest' | 'oldest' | 'budgetAsc' | 'budgetDesc';

export interface ListingsQuery {
  type?: string;
  canApplyAs?: string;
  /** 命中任一即可;listing.areas 是 JSON 字符串,跨方言没法在 SQL 里过滤,取出来 JS 端过滤 */
  areas: string[];
  budgetMin?: number;
  budgetMax?: number;
  q?: string;
  sort: ListingsSort;
}

export function parseListingsQuery(sp: URLSearchParams): ListingsQuery {
  const type = sp.get('type');
  const canApplyAs = sp.get('canApplyAs');
  const areasRaw = sp.get('areas');
  const sort = sp.get('sort') ?? 'newest';
  return {
    type: type && VALID_TYPES.includes(type) ? type : undefined,
    canApplyAs: canApplyAs && VALID_GENDERS.includes(canApplyAs) ? canApplyAs : undefined,
    areas: areasRaw ? areasRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
    budgetMin: sp.get('budgetMin') ? Number(sp.get('budgetMin')) : undefined,
    budgetMax: sp.get('budgetMax') ? Number(sp.get('budgetMax')) : undefined,
    q: sp.get('q')?.trim() || undefined,
    sort: sort === 'oldest' || sort === 'budgetAsc' || sort === 'budgetDesc' ? sort : 'newest',
  };
}

export function buildListingsWhere(qy: ListingsQuery, opts: { includeKeyword?: boolean } = {}): any {
  const where: any = { status: 'active' };
  if (qy.type) where.type = qy.type;
  // canApplyAs:用户希望投这个性别 → listing 的 lookingForGender 必须能容纳
  if (qy.canApplyAs) {
    const allowed = qy.canApplyAs === 'F' ? ['F-only', 'any'] : qy.canApplyAs === 'M' ? ['M-only', 'any'] : ['any'];
    where.lookingForGender = { in: allowed };
  }
  // 预算重叠判断(区间相交)
  if (qy.budgetMin !== undefined || qy.budgetMax !== undefined) {
    const reqMin = qy.budgetMin ?? 0;
    const reqMax = qy.budgetMax ?? Number.MAX_SAFE_INTEGER;
    where.AND = [
      { OR: [{ budgetMin: null }, { budgetMin: { lte: reqMax } }] },
      { OR: [{ budgetMax: null }, { budgetMax: { gte: reqMin } }] },
    ];
  }
  if (qy.q && opts.includeKeyword !== false) {
    where.OR = [
      { title:       { contains: qy.q } },
      { description: { contains: qy.q } },
    ];
  }
  return where;
}

export function listingsOrderBy(sort: ListingsSort) {
  return sort === 'oldest'     ? { createdAt: 'asc'  as const } :
         sort === 'budgetAsc'  ? { budgetMin: 'asc'  as const } :
         sort === 'budgetDesc' ? { budgetMax: 'desc' as const } :
                                 { bumpedAt:  'desc' as const };
}

/** JS 端 areas 过滤(SQLite / PG 跨方言兼容) */
export function filterListingsByAreas<T extends { areas: string }>(rows: T[], areas: readonly string[]): T[] {
  if (areas.length === 0) return rows;
  return rows.filter(l => parseJsonArray(l.areas).some(a => areas.includes(a)));
}

/** 只暴露 active 留言 */
export const LISTING_LIST_INCLUDE = {
  inquiries: { where: { status: 'active' }, orderBy: { createdAt: 'asc' as const } },
} as const;
