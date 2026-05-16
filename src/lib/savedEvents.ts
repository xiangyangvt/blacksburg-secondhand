// 本地活动心愿单 —— 纯 client-side(localStorage)
// 跟 savedListings(室友)/ shoppingCart(二手 item)分离;各自存储 + 各自 panel
// snapshot 模式:加入时拍快照,panel 直接渲染不再 refetch
//
// 跟 listing/item 心愿单的差异:
// - event 天然带 startAt,过期之后自动归到"已过期"段(panel 默认折叠)
// - savedAt 留着,但分组排序主键是 startAt(事件的相关性按时间衰减,而不是按收藏时间)

const KEY = 'hb_saved_events';
const MAX = 50;
const EVT = 'hb-saved-events-changed';

export type SavedEvent = {
  id: string;
  savedAt: number;
  title: string;                // 中文标题(已翻译)
  source: string;               // e.g. 'nextthreedays'
  sourceUrl: string;            // 原站 URL
  startAt: string | null;       // ISO 8601 或 null(news/discussion 通常无)
  endAt: string | null;         // ISO 8601 或 null
  publishedAt: string | null;   // 发布时间(news/discussion 用,events/sports 可有可无)
  location: string | null;
  category: string | null;      // events / sports / news / discussion
  imageUrl: string | null;
};

function load(): SavedEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(list: SavedEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* 静默 */
  }
}

export function getSavedEvents(): SavedEvent[] {
  return load();
}

export function isEventSaved(id: string): boolean {
  return load().some(e => e.id === id);
}

/**
 * 切换收藏。
 * - 未收藏 → 加入(满了返回 'full',否则 'added')
 * - 已收藏 → 移除,返回 'removed'
 */
export function toggleSavedEvent(snapshot: Omit<SavedEvent, 'savedAt'>): 'added' | 'removed' | 'full' {
  const list = load();
  const idx = list.findIndex(e => e.id === snapshot.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    persist(list);
    return 'removed';
  }
  if (list.length >= MAX) return 'full';
  list.push({ ...snapshot, savedAt: Date.now() });
  persist(list);
  return 'added';
}

export function removeSavedEvent(id: string): void {
  persist(load().filter(e => e.id !== id));
}

export function subscribeSavedEvents(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  const storage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener('storage', storage);
  };
}

// ---------- 分组 helper:upcoming / past ----------

/**
 * 把收藏列表按 startAt 分两段:
 * - upcoming: startAt 未到 / 没填时间 → 按 startAt 升序(没填的排后面)
 * - past: startAt 已过 → 按 startAt 降序(最近过期的排前面)
 *
 * "过期" 判定:endAt 存在用 endAt,否则用 startAt 当天结束(start + 6h),
 * 都没有则视为永不过期(留在 upcoming)。
 */
export function groupByTime(list: SavedEvent[], now: number = Date.now()): {
  upcoming: SavedEvent[];
  past: SavedEvent[];
} {
  const upcoming: SavedEvent[] = [];
  const past: SavedEvent[] = [];

  for (const e of list) {
    const expiry = computeExpiry(e);
    if (expiry === null || expiry > now) upcoming.push(e);
    else past.push(e);
  }

  upcoming.sort((a, b) => {
    const ta = a.startAt ? new Date(a.startAt).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.startAt ? new Date(b.startAt).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  past.sort((a, b) => {
    const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
    const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
    return tb - ta;
  });

  return { upcoming, past };
}

function computeExpiry(e: SavedEvent): number | null {
  if (e.endAt) {
    const t = new Date(e.endAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (e.startAt) {
    const t = new Date(e.startAt).getTime();
    if (!isNaN(t)) return t + 6 * 3600 * 1000; // 6h 后视为结束
  }
  return null; // 没时间信息 → 不归档
}
