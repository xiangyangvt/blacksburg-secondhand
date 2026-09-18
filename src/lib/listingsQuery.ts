// 室友 listing 公开列表的序列化(白名单)。
//
// 2026-09-18 修复:GET /api/listings 之前把每条留言 `...inq` 整行 spread 出去,只抹了联系方式,
// 留言人的 ipAddress / utmSource 会随公开列表下发(线上实测 3 条留言带非空 IP)——违反 ARCHITECTURE §2「IP 私有,永不出网」
// 与 §8.3「序列化优先白名单」。9A 修了二手(items)那一侧,室友这一侧漏了。
// 这里与 lib/itemsQuery.ts 的 serializePublicItem 同一口径:留言只给前端用得到的字段。

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
