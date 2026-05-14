// UX-10:室友 listing 的 compensatory 评分
// 心理学依据:Compensatory Decision Model —— 室友选择是 7 维互相补偿
// (不是 noncompensatory 淘汰式)。client 端按用户当前 filter 算 matchScore,
// 然后按 tier 分组渲染:完全 / 部分 / 其它
//
// 当前 scope(v1):基于 canApplyAs + areas 两个 filter 算分
// 未来 v2 backlog:加 7 维生活方式 chips 的支持(需要先把 chips 加到 ListingFilterBar)

import type { Listing } from '@/components/ListingCard';
import type { ListingFilters } from '@/components/ListingFilterBar';

export type MatchTier = 'full' | 'partial' | 'other';

export interface MatchResult {
  listing: Listing;
  score: number;
  tier: MatchTier;
  reasons: string[]; // 调试用,future hover tooltip
}

/**
 * 算 listing 的 match score(0-100)
 * - 用户没选任何 filter → score = 100(默认全 full)
 * - 用户选了 filter → 按维度加分;0-39 = other, 40-79 = partial, 80+ = full
 */
export function calcMatchScore(filters: ListingFilters, listing: Listing): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  // 没选任何 chip(默认 filter)→ score 100
  const noFilter =
    filters.canApplyAs === 'any' &&
    filters.areas.length === 0;
  if (noFilter) {
    return { score: 100, reasons: ['未筛选'] };
  }

  // 起步 base 50。每个匹配维度加分;反向减分
  let score = 50;

  // 性别:canApplyAs 是用户自己性别,看对方 lookingForGender 是否接受
  // - 'any':用户没选 → 不计分
  // - 'F' + lookingForGender='F-only' → 完全匹配,+25
  // - 'F' + lookingForGender='any' → 中性接受,+15
  // - 'F' + lookingForGender='M-only' → 反向,-30(几乎垫底)
  if (filters.canApplyAs !== 'any') {
    const userGender = filters.canApplyAs;
    const want = listing.lookingForGender;
    if (want === `${userGender}-only`) {
      score += 25;
      reasons.push(`对方找 ${userGender}-only,完全匹配`);
    } else if (want === 'any') {
      score += 15;
      reasons.push('对方不限性别');
    } else if (want === `${userGender === 'F' ? 'M' : 'F'}-only`) {
      score -= 30;
      reasons.push(`对方找另一性别,反向`);
    }
  }

  // 区域:areas 是用户选的区域列表,看 listing.areas 是否有交集
  // - 完全交集(用户全 cover) → +25
  // - 部分交集 → +10
  // - 完全无交集 → -10
  if (filters.areas.length > 0) {
    const listingAreas = parseListingAreas(listing.areas);
    const overlap = filters.areas.filter(a => listingAreas.includes(a));
    if (overlap.length === filters.areas.length && overlap.length > 0) {
      score += 25;
      reasons.push(`区域全部 cover (${overlap.join(', ')})`);
    } else if (overlap.length > 0) {
      score += 10;
      reasons.push(`区域部分匹配 (${overlap.join(', ')})`);
    } else if (listingAreas.length > 0) {
      score -= 10;
      reasons.push(`区域不交集`);
    }
    // listing 没填 area → 中性,不计分
  }

  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

/** score → tier */
export function scoreTier(score: number): MatchTier {
  if (score >= 80) return 'full';
  if (score >= 40) return 'partial';
  return 'other';
}

/** 一次性算所有 listing 的 match + 排序 + 分组 */
export function groupByMatch(filters: ListingFilters, listings: Listing[]): {
  full: MatchResult[];
  partial: MatchResult[];
  other: MatchResult[];
  total: number;
} {
  const results: MatchResult[] = listings.map(l => {
    const { score, reasons } = calcMatchScore(filters, l);
    return { listing: l, score, tier: scoreTier(score), reasons };
  });

  // 内部按 score 降序;同分按 createdAt 降序(保留 server sort)
  results.sort((a, b) => b.score - a.score);

  return {
    full:    results.filter(r => r.tier === 'full'),
    partial: results.filter(r => r.tier === 'partial'),
    other:   results.filter(r => r.tier === 'other'),
    total:   results.length,
  };
}

// listing.areas 在 schema 里是 JSON 字符串,client 端拿到时可能已经 parse 也可能没
function parseListingAreas(areas: unknown): string[] {
  if (Array.isArray(areas)) return areas as string[];
  if (typeof areas !== 'string') return [];
  try {
    const arr = JSON.parse(areas);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
