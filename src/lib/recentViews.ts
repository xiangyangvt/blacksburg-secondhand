// 最近浏览记录：纯前端 localStorage，无登录态
// 记录用户点击展开过的 item id（最多 10 个，按访问时间倒序）

const KEY = 'hb_recent_views';
const MAX = 10;

type RecentEntry = {
  id: string;
  ts: number; // 最后访问时间戳，用于排序 + 过期 / 清理
};

/** 客户端：读取最近浏览 id 列表（最新在前） */
export function getRecentViewIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr: RecentEntry[] = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .sort((a, b) => b.ts - a.ts)
      .map(e => e.id);
  } catch {
    return [];
  }
}

/** 客户端：把某条 item 标记为"刚刚看过"。最新挪到队首；超出 MAX 截断 */
export function markRecentView(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr: RecentEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(arr) ? arr.filter(e => e.id !== id) : [];
    filtered.unshift({ id, ts: Date.now() });
    const next = filtered.slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage 满 / 隐私模式 / 等都静默忽略
  }
}

/** 清空最近浏览（用户手动点"清空" 用） */
export function clearRecentViews(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}

/** 客户端：移除一条已失效的 id（商品被删除时清掉） */
export function removeRecentView(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const arr: RecentEntry[] = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    const next = arr.filter(e => e.id !== id);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}
