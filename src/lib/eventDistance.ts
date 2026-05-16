// 黑堡周边城镇距离查表(Phase 2A)
//
// 用途:
// 1. /localnews 排序「距离从近到远」
// 2. 「本地 only / 整个 NRV」筛选切换
//
// 数据:driving distance from Blacksburg, VA(approximately,manually curated)
// 单位 mi (英里)。城市名 lowercase 做 lookup,处理拼写差异(N.R.V. / NRV 等)
// 没在表里的城市 → 视为「远」(99 mi),自然排在最后
//
// 扩展:加新城市时记得 lowercase key

const CITY_DISTANCE_MI: Record<string, number> = {
  // === 本地核心 (≤ 10 mi) ===
  'blacksburg': 0,
  'christiansburg': 8,
  'fairlawn': 12,

  // === NRV 周边 (10-25 mi) ===
  'radford': 13,
  'newport': 14,
  'shawsville': 15,
  'eggleston': 17,
  'dublin': 20,
  'pembroke': 22,
  'pulaski': 24,
  'floyd': 25,

  // === 远 NRV (25-40 mi) ===
  'catawba': 28,
  'willis': 30,
  'salem': 32,
  'roanoke': 40,

  // === 弗吉尼亚州内远途 (40-150 mi) ===
  'lynchburg': 75,
  'huntington': 130,        // W.Va
  'charlottesville': 130,
  'richmond': 220,          // 超远,但我们 cap 99

  // === 校外比赛常见 (一般 > 100,统一映射到 99)===
  // (不在表里的城市自动 fallback,所以这里其实可以省略,但留作 reference)
};

const DEFAULT_FAR_MI = 99; // 未知城市默认值,排在所有已知后面

/**
 * 从 location 字符串拿出 city,查表返回距离。
 * location 格式预期是 "Venue, City" 或 "City, State.";lastIndexOf(',') 后面的部分
 * 不可靠所以我们只把 city 部分 lowercase 做 lookup。
 *
 * 例:
 *   "Lane Stadium, Blacksburg" → blacksburg → 0
 *   "Market Square Park, Blacksburg" → blacksburg → 0
 *   "Floyd EcoVillage, Floyd" → floyd → 25
 *   "Tiger Park, Baton Rouge" → baton rouge → DEFAULT_FAR_MI(99)
 */
export function distanceFromBlacksburg(location: string | null | undefined): number {
  if (!location) return DEFAULT_FAR_MI;
  // 切最后一个逗号后的部分(parseLocation 同款 heuristic)
  const idx = location.lastIndexOf(',');
  const cityPart = idx < 0 ? location : location.slice(idx + 1);
  const key = cityPart
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')      // 去掉州后缀句点("Va." → "va")
    .replace(/\s+va$/, '')   // "Blacksburg VA" → "blacksburg"
    .trim();
  return CITY_DISTANCE_MI[key] ?? DEFAULT_FAR_MI;
}

/**
 * 「本地 only」判定:距离 ≤ 15 mi 视为本地核心
 * Blacksburg + Christiansburg + Radford / Fairlawn / Newport / Shawsville
 */
export function isLocalCore(location: string | null | undefined): boolean {
  return distanceFromBlacksburg(location) <= 15;
}

/**
 * 「整个 NRV」判定:距离 ≤ 30 mi 算 NRV 范围内
 * 把 Floyd / Pulaski / Catawba 也包含进来
 */
export function isWithinNrv(location: string | null | undefined): boolean {
  return distanceFromBlacksburg(location) <= 30;
}
