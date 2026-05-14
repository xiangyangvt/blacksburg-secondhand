// 室友 listing 心愿单 —— 纯 client-side(localStorage)
// 跟 shoppingCart(二手 item)分离:listings 数据结构不同,各自存储 + 各自 panel
// 跟 item 心愿单的 snapshot 模式一致:加入时拍快照,panel 直接渲染不再 refetch

const KEY = 'hb_saved_listings';
const MAX = 50;
const EVT = 'hb-saved-listings-changed';

export type SavedListing = {
  id: string;
  savedAt: number;
  title: string;
  type: string;                  // 'find_roommate' | 'co_rent' | 'sublet' | 'summer'
  photoUrl: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
};

function load(): SavedListing[] {
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

function persist(list: SavedListing[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* 静默 */
  }
}

export function getSavedListings(): SavedListing[] {
  return load();
}

export function isListingSaved(id: string): boolean {
  return load().some(l => l.id === id);
}

/**
 * 切换收藏。
 * - 未收藏 → 加入(满了返回 'full',否则返回 'added')
 * - 已收藏 → 移除,返回 'removed'
 */
export function toggleSavedListing(snapshot: Omit<SavedListing, 'savedAt'>): 'added' | 'removed' | 'full' {
  const list = load();
  const idx = list.findIndex(l => l.id === snapshot.id);
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

export function removeSavedListing(id: string): void {
  persist(load().filter(l => l.id !== id));
}

export function subscribeSavedListings(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) cb();
  });
  return () => {
    window.removeEventListener(EVT, handler);
  };
}
