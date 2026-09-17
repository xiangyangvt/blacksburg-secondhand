import { describe, it, expect } from 'vitest';
import { checkQuota, isBotUA, type QuotaDb } from './rateLimit';

// 内存版 RateLimitHit,实现 checkQuota 用到的四个方法
function memDb() {
  const rows: { key: string; tag: string | null; createdAt: Date }[] = [];
  const db: QuotaDb = {
    rateLimitHit: {
      async count({ where }) {
        return rows.filter(r => r.key === where.key && r.createdAt > where.createdAt.gt).length;
      },
      async findFirst({ where, orderBy }) {
        let hits = rows.filter(r => r.key === where.key && r.createdAt > where.createdAt.gt);
        if (where.tag !== undefined) hits = hits.filter(r => r.tag === where.tag);
        if (orderBy?.createdAt === 'asc') hits.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return hits[0] ? { createdAt: hits[0].createdAt } : null;
      },
      async create({ data }) {
        rows.push({ key: data.key, tag: data.tag ?? null, createdAt: new Date(clock.t) });
      },
      async deleteMany({ where }) {
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].createdAt < where.createdAt.lt) rows.splice(i, 1);
      },
    },
  };
  const clock = { t: 1_000_000_000_000 };
  return { db, rows, clock, now: () => clock.t };
}

describe('checkQuota', () => {
  it('允许前 max 次,第 max+1 次拒绝并给出 retryAfter', async () => {
    const { db, now } = memDb();
    const opts = { key: 'k', windowMs: 3600e3, max: 3 };
    for (let i = 0; i < 3; i++) {
      const r = await checkQuota(opts, db, now, () => 1);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(2 - i);
    }
    const r = await checkQuota(opts, db, now, () => 1);
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSec).toBe(3600);
  });

  it('窗口滑过后恢复', async () => {
    const { db, clock, now } = memDb();
    const opts = { key: 'k', windowMs: 60e3, max: 1 };
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(true);
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(false);
    clock.t += 60e3 + 1;
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(true);
  });

  it('不同 key 互不影响', async () => {
    const { db, now } = memDb();
    expect((await checkQuota({ key: 'a', windowMs: 60e3, max: 1 }, db, now, () => 1)).ok).toBe(true);
    expect((await checkQuota({ key: 'b', windowMs: 60e3, max: 1 }, db, now, () => 1)).ok).toBe(true);
    expect((await checkQuota({ key: 'a', windowMs: 60e3, max: 1 }, db, now, () => 1)).ok).toBe(false);
  });

  it('同 key 同 tag 在窗口内只计一次', async () => {
    const { db, rows, now } = memDb();
    const opts = { key: 'k', windowMs: 3600e3, max: 2 };
    for (let i = 0; i < 50; i++) {
      const r = await checkQuota({ ...opts, tag: 'item-1' }, db, now, () => 1);
      expect(r.ok).toBe(true);
    }
    expect(rows.length).toBe(1);
    expect((await checkQuota({ ...opts, tag: 'item-2' }, db, now, () => 1)).ok).toBe(true);
    expect((await checkQuota({ ...opts, tag: 'item-3' }, db, now, () => 1)).ok).toBe(false);
  });

  it('机会式清理删掉 48h 前的行', async () => {
    const { db, rows, clock, now } = memDb();
    await checkQuota({ key: 'k', windowMs: 60e3, max: 10 }, db, now, () => 1);
    clock.t += 49 * 3600e3;
    await checkQuota({ key: 'k', windowMs: 60e3, max: 10 }, db, now, () => 0); // rand=0 触发清理
    await new Promise(r => setTimeout(r, 0));
    expect(rows.length).toBe(1);
  });
});

describe('isBotUA', () => {
  it('basic 只拦 bot/crawler/spider', () => {
    expect(isBotUA('Mozilla/5.0 Googlebot', 'basic')).toBe(true);
    expect(isBotUA('HeadlessChrome/120', 'basic')).toBe(false);
    expect(isBotUA('WeChat preview', 'basic')).toBe(false);
  });
  it('full 再拦 preview/headless', () => {
    expect(isBotUA('HeadlessChrome/120', 'full')).toBe(true);
    expect(isBotUA('WeChat preview', 'full')).toBe(true);
    expect(isBotUA('Mozilla/5.0 (iPhone) Safari', 'full')).toBe(false);
  });
  it('接受 Request 对象', () => {
    const req = new Request('http://x', { headers: { 'user-agent': 'my-spider/1.0' } });
    expect(isBotUA(req)).toBe(true);
    expect(isBotUA(new Request('http://x'))).toBe(false);
  });
});
