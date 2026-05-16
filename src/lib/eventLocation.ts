// 解析 event 的 location 字符串(Sprint 7 Phase 1.9 调优)
//
// 数据格式约定:"Venue, City" — 比如 "Market Square Park, Blacksburg"
// Sean 反馈:城市是决定能不能去的关键(距离锚点),应该最先看到。
// 所以前端展示时把 city 提前到 venue 之前,且给 city 更重的视觉权重。
//
// 用 lastIndexOf(',') 切 — 防止 venue 本身有逗号(如 "Macado's (Radford), Radford")
// 切完 city 是 "Radford",venue 是 "Macado's (Radford)"。✅
//
// edge cases:
//   "Blacksburg"           → { city: "Blacksburg", venue: null }
//   "Champs, Blacksburg"   → { city: "Blacksburg", venue: "Champs" }
//   ""                     → { city: null, venue: null }
//   "Floyd EcoVillage, Floyd" → { city: "Floyd", venue: "Floyd EcoVillage" }
//     ↑ city = venue 子串时不做去重(场地名往往就含城市,语义合理)

export function parseLocation(loc: string | null | undefined): {
  city: string | null;
  venue: string | null;
} {
  if (!loc) return { city: null, venue: null };
  const trimmed = loc.trim();
  if (!trimmed) return { city: null, venue: null };
  const idx = trimmed.lastIndexOf(',');
  if (idx < 0) return { city: trimmed, venue: null };
  const venue = trimmed.slice(0, idx).trim();
  const city = trimmed.slice(idx + 1).trim();
  return {
    city: city || null,
    venue: venue || null,
  };
}
