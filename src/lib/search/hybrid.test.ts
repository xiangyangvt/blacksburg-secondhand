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
  it('阈值默认 0.40,env 合法值覆盖,非法值忽略', () => {
    expect(semanticMinSim({} as any)).toBe(0.4);
    expect(semanticMinSim({ SEARCH_SEMANTIC_MIN_SIM: '0.5' } as any)).toBe(0.5);
    expect(semanticMinSim({ SEARCH_SEMANTIC_MIN_SIM: 'abc' } as any)).toBe(0.4);
    expect(semanticMinSim({ SEARCH_SEMANTIC_MIN_SIM: '2' } as any)).toBe(0.4);
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
  it('同词并发 5 个请求只付 1 次费;失败后不缓存、可重试', async () => {
    let calls = 0; let fail = true;
    const c = new QueryEmbeddingCache(async () => { calls++; await new Promise(r => setTimeout(r, 5)); if (fail) throw new Error('x'); return [1]; }, () => 0);
    await expect(Promise.all([c.get('a'), c.get('a'), c.get('a'), c.get('a'), c.get('a')])).rejects.toThrow('x');
    expect(calls).toBe(1);
    fail = false;
    await expect(Promise.all([c.get('a'), c.get('a')])).resolves.toEqual([[1], [1]]);
    expect(calls).toBe(2);
  });
  it('过期刷新会更新 LRU 位置:满容量时被淘汰的是真正最久未用的', async () => {
    let t = 0; let calls = 0;
    const c = new QueryEmbeddingCache(async () => { calls++; return [calls]; }, () => t, 100);
    // 填到上限 500
    for (let i = 0; i < 500; i++) await c.get(`k${i}`);
    t = 101; // 全部过期
    await c.get('k0');                  // k0 刷新 → 应移到最新位置
    await c.get('brand-new');           // 触发淘汰:应淘汰 k1(最旧),不是刚刷新的 k0
    const before = calls;
    await c.get('k0');                  // 仍在缓存(未过期,t 没变)
    expect(calls).toBe(before);
    await c.get('k1');                  // 已被淘汰 → 再付费
    expect(calls).toBe(before + 1);
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

function memDb(clock: () => number = Date.now): QuotaDb & { seed: (key: string, n: number, at: number) => void } {
  type Row = { id: string; key: string; tag: string | null; bucket: number | null; admitted: boolean; createdAt: Date };
  const rows: Row[] = []; let seq = 0;
  const seed = (key: string, n: number, at: number) => { for (let i = 0; i < n; i++) rows.push({ id: `s${++seq}`, key, tag: null, bucket: null, admitted: true, createdAt: new Date(at) }); };
  const inWin = (w: { key: string; createdAt: { gt: Date }; tag?: string }) =>
    rows.filter(r => r.key === w.key && r.createdAt > w.createdAt.gt && (w.tag === undefined || r.tag === w.tag));
  return { seed, rateLimitHit: {
    async count({ where }) { return inWin(where).length; },
    async findFirst({ where }) { const h = inWin(where)[0]; return h ? { id: h.id, admitted: h.admitted, createdAt: h.createdAt } : null; },
    async findMany({ where, skip, take }) { return inWin(where).sort((a, b) => +a.createdAt - +b.createdAt).slice(skip, skip + take).map(r => ({ createdAt: r.createdAt })); },
    async create({ data }) { const row = { id: `r${++seq}`, ...data, admitted: false, createdAt: new Date(clock()) }; rows.push(row); return { id: row.id }; },
    async update({ where, data }) { const r = rows.find(r => r.id === where.id); if (r) r.admitted = data.admitted; },
    async deleteMany() {},
  } };
}

const req = (opts: { ua?: string; vid?: string; ip?: string } = {}) =>
  new NextRequest('http://x/api/search?site=items&q=a', {
    headers: {
      'user-agent': opts.ua ?? 'Mozilla/5.0 (iPhone) Safari',
      'x-forwarded-for': opts.ip ?? '10.0.0.1',
      ...(opts.vid ? { cookie: `hb_vid=${opts.vid}` } : {}),
    },
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
  it('双桶 retryAfter:IP 桶 10s 后释放但 visitor 桶本次刚占满 → 取 visitor 的 3590s,不是 10s', async () => {
    const T = 1_800_000_000_000; const HOUR = 3600e3;
    const db = memDb(() => T);
    const vid = '0f1e2d3c-4b5a-6978-8a9b-c0d1e2f3a4b5';
    db.seed(`search:vid:${vid}:h`, SEARCH_LIMITS.visitorPerHour - 1, T - 10_000);      // 59 条,10 秒前 → 3590s 后释放
    db.seed('search:ip:1.2.3.4:h', SEARCH_LIMITS.ipPerHour, T - HOUR + 10_000);          // 300 条,10 秒后释放
    const g = await gateSemanticSearch(req({ vid, ip: '1.2.3.4' }), db, () => T);
    expect(g).toMatchObject({ ok: false, reason: 'limited' });
    if (!g.ok) expect(g.retryAfterSec).toBe(3590);
  });

  it('轮换 cookie 绕不过:同 IP 不带 cookie 第 301 次被 IP 配额拦下', async () => {
    const db = memDb();
    for (let i = 0; i < SEARCH_LIMITS.ipPerHour; i++) expect((await gateSemanticSearch(req({ ip: '1.2.3.4' }), db)).ok).toBe(true);
    expect(await gateSemanticSearch(req({ ip: '1.2.3.4' }), db)).toMatchObject({ ok: false, reason: 'limited' });
    expect((await gateSemanticSearch(req({ ip: '5.6.7.8' }), db)).ok).toBe(true);
  });
});
