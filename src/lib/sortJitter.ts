// 二手 random A+B 排序工具(Sean 设计)
//
// 思路:
// A. 默认排序 — 跨天严格按 createdAt 倒序;同一天发的商品互相随机
//    新货依然占顶 24h 窗口期,但同日发布顺序每次刷新略变
// B. 「换一批」按钮 — 当前可见列表完全 shuffle 一次,用户主动 randomize
//
// 用 seeded shuffle 保证同一 seed 下顺序稳定(避免 React 重渲染时洗牌)

export type Datelike = { createdAt: string | Date };

/** 同一日内 jitter 排序 — seed 控制随机性,seed 相同 → 顺序相同 */
export function sortWithDayJitter<T extends Datelike>(items: T[], seed: number): T[] {
  if (items.length === 0) return items;

  // 1. 跨天按日期分桶
  const byDay = new Map<string, T[]>();
  for (const it of items) {
    const d = new Date(it.createdAt);
    const key = isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10);
    const arr = byDay.get(key) ?? [];
    arr.push(it);
    byDay.set(key, arr);
  }

  // 2. 桶内 seeded shuffle
  const sortedKeys = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a)); // 日期倒序

  const out: T[] = [];
  let runningSeed = seed;
  for (const key of sortedKeys) {
    const bucket = byDay.get(key)!;
    if (bucket.length === 1) {
      out.push(bucket[0]);
      continue;
    }
    // Fisher-Yates with seeded random
    const arr = [...bucket];
    for (let i = arr.length - 1; i > 0; i--) {
      runningSeed = (runningSeed * 9301 + 49297) % 233280;  // LCG
      const j = Math.floor((runningSeed / 233280) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    out.push(...arr);
  }

  return out;
}

/** 完全 shuffle — 用户点「换一批」时 */
export function shuffleAll<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
