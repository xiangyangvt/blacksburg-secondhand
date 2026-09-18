import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
  isSearchAiEnabled, semanticMinSim, QueryEmbeddingCache, pickSemantic, semanticTrigger, gateSemanticSearch, SEARCH_LIMITS,
} from './hybrid';
import type { QuotaDb } from '@/lib/rateLimit';

describe('开关与阈值', () => {
  it('SEARCH_AI_ENABLED 必须是字符串 true 且 key 存在', () => {
    const saved = process.env.LLM_EMBED_API_KEY;
    process.env.LLM_EMBED_API_KEY = 'k';
    expect(isSearchAiEnabled({ SEARCH_AI_ENABLED: 'true' } as any)).toBe(true);
    expect(isSearchAiEnabled({ SEARCH_AI_ENABLED: '1' } as any)).toBe(false);
    expect(isSearchAiEnabled({} as any)).toBe(false);
    process.env.LLM_EMBED_API_KEY = '';
    expect(isSearchAiEnabled({ SEARCH_AI_ENABLED: 'true' } as any)).toBe(false);
    if (saved === undefined) delete process.env.LLM_EMBED_API_KEY; else process.env.LLM_EMBED_API_KEY = saved;
  });
  it('阈值默认 0.35,env 合法值覆盖,非法值忽略', () => {
    expect(semanticMinSim({} as any)).toBe(0.35);
    expect(semanticMinSim({ SEARCH_SEMANTIC_MIN_SIM: '0.5' } as any)).toBe(0.5);
    expect(semanticMinSim({ SEARCH_SEMANTIC_MIN_SIM: 'abc' } as any)).toBe(0.35);
    expect(semanticMinSim({ SEARCH_SEMANTIC_MIN_SIM: '2' } as any)).toBe(0.35);
  });
});

describe('QueryEmbeddingCache', () => {
  it('同一查询词(归一化后)5 次只调 1 次 embed;10 分钟后过期', async () => {
    let calls = 0; let t = 0;
    const c = new QueryEmbeddingCache(async () => { calls++; return [1, 2, 3]; }, () => t);
    for (const q of ['Sofa', ' sofa ', 'SOFA', 'sofa', 'so fa'.replace(' ', '')]) await c.get(q);
    expect(calls).toBe(1);
    expect(c.hits).toBe(4);
    t = 10 * 60e3 + 1;
    await c.get('sofa');
    expect(calls).toBe(2);
  });
  it('不同词各自调用', async () => {
    let calls = 0;
    const c = new QueryEmbeddingCache(async () => { calls++; return [0]; }, () => 0);
    await c.get('a'); await c.get('b');
    expect(calls).toBe(2);
  });
});

describe('pickSemantic', () => {
  const hits = [
    { id: 'k1', similarity: 0.9 }, { id: 's1', similarity: 0.8 }, { id: 'low', similarity: 0.2 },
    { id: 's2', similarity: 0.5 }, { id: 's3', similarity: 0.36 }, { id: 'nan', similarity: NaN },
  ];
  it('去掉关键词已有 id、低于阈值、NaN;按相似度降序;最多 max 条', () => {
    expect(pickSemantic(hits, ['k1'], 0.35, 10)).toEqual([
      { id: 's1', similarity: 0.8 }, { id: 's2', similarity: 0.5 }, { id: 's3', similarity: 0.36 },
    ]);
    expect(pickSemantic(hits, ['k1'], 0.35, 2).map(p => p.id)).toEqual(['s1', 's2']);
  });
  it('重复 id 只保留一次', () => {
    expect(pickSemantic([{ id: 'a', similarity: 0.9 }, { id: 'a', similarity: 0.8 }], [], 0, 10)).toHaveLength(1);
  });
});

describe('semanticTrigger', () => {
  it('< 5 auto,≥ 5 button', () => {
    expect(semanticTrigger(0)).toBe('auto');
    expect(semanticTrigger(4)).toBe('auto');
    expect(semanticTrigger(5)).toBe('button');
  });
});

function memDb(): QuotaDb {
  type Row = { id: string; key: string; tag: string | null; bucket: number | null; admitted: boolean; createdAt: Date };
  const rows: Row[] = []; let seq = 0;
  const inWin = (w: { key: string; createdAt: { gt: Date }; tag?: string }) =>
    rows.filter(r => r.key === w.key && r.createdAt > w.createdAt.gt && (w.tag === undefined || r.tag === w.tag));
  return { rateLimitHit: {
    async count({ where }) { return inWin(where).length; },
    async findFirst({ where }) { const h = inWin(where)[0]; return h ? { id: h.id, admitted: h.admitted, createdAt: h.createdAt } : null; },
    async findMany({ where, skip, take }) { return inWin(where).sort((a, b) => +a.createdAt - +b.createdAt).slice(skip, skip + take).map(r => ({ createdAt: r.createdAt })); },
    async create({ data }) { const row = { id: `r${++seq}`, ...data, admitted: false, createdAt: new Date() }; rows.push(row); return { id: row.id }; },
    async update({ where, data }) { const r = rows.find(r => r.id === where.id); if (r) r.admitted = data.admitted; },
    async deleteMany() {},
  } };
}

const req = (opts: { ua?: string; vid?: string } = {}) =>
  new NextRequest('http://x/api/search?site=items&q=a', {
    headers: { 'user-agent': opts.ua ?? 'Mozilla/5.0 (iPhone) Safari', ...(opts.vid ? { cookie: `hb_vid=${opts.vid}` } : {}) },
  });

describe('gateSemanticSearch', () => {
  it('bot UA → 不给语义路', async () => {
    const g = await gateSemanticSearch(req({ ua: 'Googlebot' }), memDb());
    expect(g).toMatchObject({ ok: false, reason: 'bot' });
  });
  it('同 visitor 第 61 次被限,带 retryAfter;新 visitor 标 isNew', async () => {
    const db = memDb();
    const vid = '0f1e2d3c-4b5a-6978-8a9b-c0d1e2f3a4b5';
    for (let i = 0; i < SEARCH_LIMITS.visitorPerHour; i++) expect((await gateSemanticSearch(req({ vid }), db)).ok).toBe(true);
    const g = await gateSemanticSearch(req({ vid }), db);
    expect(g).toMatchObject({ ok: false, reason: 'limited' });
    if (!g.ok) expect(g.retryAfterSec).toBeGreaterThan(0);
    const fresh = await gateSemanticSearch(req(), db);
    expect(fresh).toMatchObject({ ok: true, isNew: true });
  });
});
