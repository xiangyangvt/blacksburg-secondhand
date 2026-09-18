// Sprint 10B-2:活动列表查询的共用部分(GET /api/events 与 GET /api/search?site=events 共用,语义与抽出前逐字一致)

// Phase 3A.1: 旧 → 新类别 ID 翻译表(Railway 上 db push 不跑 data migration,
// DB 里可能还存旧 ID;UI 层用新 ID 过滤会找不到。这里两边都包容)
export const CATEGORY_NEW_TO_OLD: Record<string, string[]> = {
  life:        ['life', 'events'],
  competition: ['competition', 'sports'],
  discussion:  ['discussion', 'news'],
  // exercise / academic / other 是新的,不需要 alias
};
export const CATEGORY_OLD_TO_NEW: Record<string, string> = {
  events: 'life',
  sports: 'competition',
  news:   'discussion',
};

/** discussion / news 类目与 reddit 源永久砍掉(Phase 3B);传这两个类目直接返空 */
export function isRetiredCategory(category: string | null | undefined): boolean {
  return category === 'discussion' || category === 'news';
}

/**
 * 过滤:仅 active + qualityScore ≥ 0.5 + 未过期(过期 = endAt 已过 OR 没 endAt 但 startAt 早于 1 天前)
 * 永远排除 reddit_vt / reddit_nrv source 与 discussion / news 类目
 */
export function buildEventsBaseWhere(now: number = Date.now()): any {
  const oneDayAgo = new Date(now - 86400000);
  return {
    status: 'active',
    qualityScore: { gte: 0.5 },
    source: { notIn: ['reddit_vt', 'reddit_nrv'] },
    category: { notIn: ['discussion', 'news'] },
    OR: [
      { endAt: { gte: new Date(now) } },
      { endAt: null, startAt: { gte: oneDayAgo } },
      { startAt: null },
    ],
  };
}

/** category 筛选 — 同时匹配新 ID 和旧 ID(兼容未迁移数据) */
export function buildEventsWhere(category: string | null | undefined, now: number = Date.now()): any {
  const base = buildEventsBaseWhere(now);
  return category ? { ...base, category: { in: CATEGORY_NEW_TO_OLD[category] ?? [category] } } : base;
}

/**
 * 公开序列化:posterCodeHash / posterVisitorId 不出网;
 * Sprint 9A:posterContactPublic 在服务端生效 —— 非公开的联系方式置 null(响应者走 contact-send → reveal-to-responder);
 * 向量相关字段不回传;photoUrls 从 JSON string parse 成数组。
 */
export function serializePublicEvent(e: any, responseCount = 0) {
  const { posterCodeHash, posterVisitorId, photoUrls: pu, embeddingJson, embeddedAt, embedVersion, ...rest } = e;
  void posterCodeHash; void posterVisitorId; void embeddingJson; void embeddedAt; void embedVersion;
  let photoUrls: string[] = [];
  if (pu) {
    try { photoUrls = JSON.parse(pu); } catch { photoUrls = []; }
  }
  const contactFields = rest.posterContactPublic
    ? {}
    : { posterContact: null, posterContactType: null, posterContactLabel: null };
  return { ...rest, ...contactFields, photoUrls, responseCount };
}
