import { describe, it, expect } from 'vitest';
import { mergeSimilar } from './similar';

describe('mergeSimilar', () => {
  it('同一候选取对各引子的最高分;低于阈值丢弃;降序;截断', () => {
    const hits = [
      { sourceId: 's1', id: 'a', similarity: 0.5 },
      { sourceId: 's2', id: 'a', similarity: 0.9 },
      { sourceId: 's1', id: 'b', similarity: 0.7 },
      { sourceId: 's2', id: 'c', similarity: 0.2 },
      { sourceId: 's2', id: 'd', similarity: NaN },
    ];
    expect(mergeSimilar(hits, 0.35, 10)).toEqual(['a', 'b']);
    expect(mergeSimilar(hits, 0.35, 1)).toEqual(['a']);
    expect(mergeSimilar(hits, 0, 10)).toEqual(['a', 'b', 'c']);
    expect(mergeSimilar([], 0.35, 10)).toEqual([]);
  });
});
