import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { gateReveal, REVEAL_LIMITS } from './contactQuota';
import type { QuotaDb } from './rateLimit';

// 与 rateLimit.test.ts 同款内存 db(串行场景,不需要 tick 交错)
function memDb(): QuotaDb {
  type Row = { id: string; key: string; tag: string | null; bucket: number | null; admitted: boolean; createdAt: Date };
  const rows: Row[] = []; let seq = 0;
  const inWin = (w: { key: string; createdAt: { gt: Date }; tag?: string; bucket?: number }) =>
    rows.filter(r => r.key === w.key && r.createdAt > w.createdAt.gt && (w.tag === undefined || r.tag === w.tag) && (w.bucket === undefined || r.bucket === w.bucket));
  return { rateLimitHit: {
    async count({ where }) { return inWin(where).length; },
    async findFirst({ where }) { const h = inWin(where)[0]; return h ? { id: h.id, admitted: h.admitted } : null; },
    async findMany({ where, skip, take }) { return inWin(where).sort((a, b) => +a.createdAt - +b.createdAt).slice(skip, skip + take).map(r => ({ createdAt: r.createdAt })); },
    async create({ data }) {
      if (data.tag !== null && rows.some(r => r.key === data.key && r.tag === data.tag && r.bucket === data.bucket)) throw Object.assign(new Error(), { code: 'P2002' });
      const row = { id: `r${++seq}`, ...data, admitted: false, createdAt: new Date() }; rows.push(row); return { id: row.id };
    },
    async update({ where, data }) { const r = rows.find(r => r.id === where.id); if (r) r.admitted = data.admitted; },
    async deleteMany() {},
  } };
}

const req = (opts: { ua?: string; vid?: string; ip?: string } = {}) =>
  new NextRequest('http://x/api/items/1/reveal-contact', {
    method: 'POST',
    headers: {
      'user-agent': opts.ua ?? 'Mozilla/5.0 (iPhone) Safari',
      ...(opts.vid ? { cookie: `hb_vid=${opts.vid}` } : {}),
      'x-forwarded-for': opts.ip ?? '10.0.0.1',
    },
  });

describe('gateReveal', () => {
  it('bot UA 直接 403', async () => {
    const g = await gateReveal(req({ ua: 'HeadlessChrome' }), 'item:1', memDb());
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.res.status).toBe(403);
  });

  it('同 visitor 第 31 个不同目标 429,带 Retry-After 与中英文提示', async () => {
    const db = memDb();
    for (let i = 0; i < REVEAL_LIMITS.visitorPerHour; i++) {
      const g = await gateReveal(req({ vid: 'v1' }), `item:${i}`, db);
      expect(g.ok).toBe(true);
    }
    const g = await gateReveal(req({ vid: 'v1' }), 'item:new', db);
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.res.status).toBe(429);
      expect(g.res.headers.get('Retry-After')).toMatch(/^\d+$/);
      const body = await g.res.json();
      expect(body.error).toContain('上限');
      expect(body.errorEn).toContain('limit');
    }
  });

  it('同 visitor 同目标重复 50 次不消耗配额', async () => {
    const db = memDb();
    for (let i = 0; i < 50; i++) expect((await gateReveal(req({ vid: 'v1' }), 'item:same', db)).ok).toBe(true);
    for (let i = 0; i < REVEAL_LIMITS.visitorPerHour - 1; i++) expect((await gateReveal(req({ vid: 'v1' }), `item:${i}`, db)).ok).toBe(true);
    expect((await gateReveal(req({ vid: 'v1' }), 'item:overflow', db)).ok).toBe(false);
  });

  it('换 visitor 换 IP 后恢复;同 IP 多 visitor 受 60/h 限制', async () => {
    const db = memDb();
    let vid = 0;
    let total = 0;
    while (total < REVEAL_LIMITS.ipPerHour) {
      const v = `v${vid++}`;
      for (let i = 0; i < REVEAL_LIMITS.visitorPerHour && total < REVEAL_LIMITS.ipPerHour; i++, total++) {
        expect((await gateReveal(req({ vid: v, ip: '1.1.1.1' }), `item:${total}`, db)).ok).toBe(true);
      }
    }
    expect((await gateReveal(req({ vid: 'vX', ip: '1.1.1.1' }), 'item:x', db)).ok).toBe(false);
    expect((await gateReveal(req({ vid: 'vX', ip: '2.2.2.2' }), 'item:x', db)).ok).toBe(true);
  });

  it('新访客的响应带 hb_vid cookie', async () => {
    const g = await gateReveal(req(), 'item:1', memDb());
    expect(g.ok).toBe(true);
    if (g.ok) {
      const { NextResponse } = await import('next/server');
      const res = g.withCookie(NextResponse.json({}));
      expect(res.headers.get('set-cookie')).toContain('hb_vid=');
    }
  });
});
