// 最近浏览记录：纯前端 localStorage，无登录态
// 'item' 和 'listing' 各有独立的 storage key

const KEY_ITEM    = 'hb_recent_views';        // 历史兼容（不要改名，老用户已有数据）
const KEY_LISTING = 'hb_recent_listings';
const MAX = 10;

export type ViewKind = 'item' | 'listing';

type RecentEntry = {
  id: string;
  ts: number;
};

function storageKey(kind: ViewKind): string {
  return kind === 'listing' ? KEY_LISTING : KEY_ITEM;
}

/** 取最近浏览 id 列表（最新在前）。kind 默认 'item' 保持向后兼容。 */
export function getRecentViewIds(kind: ViewKind = 'item'): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(kind));
    if (!raw) return [];
    const arr: RecentEntry[] = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.sort((a, b) => b.ts - a.ts).map(e => e.id);
  } catch {
    return [];
  }
}

/** 标记某条 item/listing 为"刚刚看过"。 */
export function markRecentView(id: string, kind: ViewKind = 'item'): void {
  if (typeof window === 'undefined') return;
  try {
    const key = storageKey(kind);
    const raw = window.localStorage.getItem(key);
    const arr: RecentEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(arr) ? arr.filter(e => e.id !== id) : [];
    filtered.unshift({ id, ts: Date.now() });
    window.localStorage.setItem(key, JSON.stringify(filtered.slice(0, MAX)));
  } catch {}
}

/** 清空 */
export function clearRecentViews(kind: ViewKind = 'item'): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(storageKey(kind)); } catch {}
}

/** 移除一条失效条目 */
export function removeRecentView(id: string, kind: ViewKind = 'item'): void {
  if (typeof window === 'undefined') return;
  try {
    const key = storageKey(kind);
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const arr: RecentEntry[] = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    const next = arr.filter(e => e.id !== id);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}
