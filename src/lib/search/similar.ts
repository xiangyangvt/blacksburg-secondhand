// Sprint 11B:多引子近邻结果的合并(纯函数)

import type { SourcedHit } from './vectorStore';

/** 每件候选取它对各引子的最高相似度;低于阈值的丢弃;降序取前 limit。返回候选 id */
export function mergeSimilar(hits: readonly SourcedHit[], minSim: number, limit: number): string[] {
  const best = new Map<string, number>();
  for (const h of hits) {
    if (!(h.similarity >= minSim)) continue;
    const cur = best.get(h.id);
    if (cur === undefined || h.similarity > cur) best.set(h.id, h.similarity);
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.max(0, limit)).map(([id]) => id);
}
