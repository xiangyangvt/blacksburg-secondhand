import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { sanitizeFeedback, gateFeedback, FEEDBACK_LIMITS, FEEDBACK_MAX_CHARS } from './feedback';
import type { QuotaDb } from './rateLimit';

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
const req = (o: { ua?: string; vid?: string; ip?: string } = {}) => new NextRequest('http://x/api/feedback', {
  method: 'POST',
  headers: { 'user-agent': o.ua ?? 'Mozilla/5.0 Safari', 'x-forwarded-for': o.ip ?? '10.0.0.1', ...(o.vid ? { cookie: `hb_vid=${o.vid}` } : {}) },
});

describe('sanitizeFeedback', () => {
  it('空 / 非字符串 message → null', () => {
    for (const b of [null, 1, {}, { message: '   ' }, { message: 5 }]) expect(sanitizeFeedback(b)).toBeNull();
  });
  it('截断、默认 source、contact 空串归 null', () => {
    const r = sanitizeFeedback({ message: `  ${'好'.repeat(FEEDBACK_MAX_CHARS + 50)}  `, contact: '   ', source: 'nope' });
    expect(r?.message.length).toBe(FEEDBACK_MAX_CHARS);
    expect(r?.contact).toBeNull();
    expect(r?.source).toBe('chat');
  });
  it('page 只留路径:query / hash 不入库;非站内路径丢弃', () => {
    expect(sanitizeFeedback({ message: 'x', page: '/roommates?focus=abc&utm_source=wx#top' })?.page).toBe('/roommates');
    expect(sanitizeFeedback({ message: 'x', page: 'https://evil.example/x' })?.page).toBeNull();
  });
  it('contact 保留并压空白', () => {
    expect(sanitizeFeedback({ message: 'x', contact: ' wx:  abc ', source: 'empty' })).toMatchObject({ contact: 'wx: abc', source: 'empty' });
  });
});

describe('gateFeedback', () => {
  it('bot UA → bot', async () => {
    expect(await gateFeedback(req({ ua: 'HeadlessChrome' }), memDb())).toMatchObject({ ok: false, reason: 'bot' });
  });
  it('同 visitor 超过小时上限被限,带 retryAfter', async () => {
    const db = memDb(); const vid = '0f1e2d3c-4b5a-6978-8a9b-c0d1e2f3a4b5';
    for (let i = 0; i < FEEDBACK_LIMITS.visitorPerHour; i++) expect((await gateFeedback(req({ vid }), db)).ok).toBe(true);
    const g = await gateFeedback(req({ vid }), db);
    expect(g).toMatchObject({ ok: false, reason: 'limited' });
    if (!g.ok) expect(g.retryAfterSec).toBeGreaterThan(0);
  });
  it('轮换 cookie:同 IP 超过上限被拦', async () => {
    const db = memDb();
    for (let i = 0; i < FEEDBACK_LIMITS.ipPerHour; i++) expect((await gateFeedback(req({ ip: '9.9.9.9' }), db)).ok).toBe(true);
    expect(await gateFeedback(req({ ip: '9.9.9.9' }), db)).toMatchObject({ ok: false, reason: 'limited' });
  });
});
