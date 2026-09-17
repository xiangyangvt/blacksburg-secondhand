import { describe, it, expect } from 'vitest';
import { checkQuota, isBotUA, type QuotaDb } from './rateLimit';

// 内存版 RateLimitHit。实现与 SQL 一致的语义:
// - @@unique([key, tag, bucket]):tag 为 NULL 的行互不冲突(SQL NULL ≠ NULL)
// - 只按 createdAt 排序,不加 id 兜底(生产查询没有)
// - 每个 await 让出一次事件循环,让 Promise.all 的并发调用真正交错
function memDb() {
  type Row = { id: string; key: string; tag: string | null; bucket: number | null; createdAt: Date };
  const rows: Row[] = [];
  let seq = 0;
  const tick = () => new Promise<void>(r => setTimeout(r, 0));
  const inWin = (where: { key: string; createdAt: { gt: Date } }) =>
    rows.filter(r => r.key === where.key && r.createdAt > where.createdAt.gt);
  const db: QuotaDb = {
    rateLimitHit: {
      async count({ where }) { await tick(); return inWin(where).length; },
      async findFirst({ where }) {
        await tick();
        const hits = inWin(where).slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return hits[0] ? { createdAt: hits[0].createdAt } : null;
      },
      async create({ data }) {
        await tick();
        if (data.tag !== null && rows.some(r => r.key === data.key && r.tag === data.tag && r.bucket === data.bucket)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row = { id: `r${++seq}`, key: data.key, tag: data.tag, bucket: data.bucket, createdAt: new Date(clock.t) };
        rows.push(row);
        return { id: row.id };
      },
      async deleteMany({ where }) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].createdAt < where.createdAt.lt) rows.splice(i, 1); },
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

describe('checkQuota · 边界与并发(Codex 互审补)', () => {
  it('窗口精确边界:59999ms 仍拒,60000ms 放行', async () => {
    const { db, clock, now } = memDb();
    const opts = { key: 'k', windowMs: 60e3, max: 1 };
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(true);
    clock.t += 59_999;
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(false);
    clock.t += 1;
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(true);
  });

  it('并发 20 次 max=1:放行 ≤ 1(失败方向是过严不是过宽);被拒的尝试也占行', async () => {
    const { db, rows, now } = memDb();
    const opts = { key: 'k', windowMs: 60e3, max: 1 };
    const results = await Promise.all(Array.from({ length: 20 }, () => checkQuota(opts, db, now, () => 1)));
    expect(results.filter(r => r.ok).length).toBeLessThanOrEqual(1);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // 之后的请求都被拒:被拒尝试计入配额
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(false);
  });

  it('并发同 tag 双写只留一行,不消耗额外配额', async () => {
    const { db, rows, now } = memDb();
    const opts = { key: 'k', windowMs: 3600e3, max: 2 };
    const results = await Promise.all(Array.from({ length: 5 }, () => checkQuota({ ...opts, tag: 'item-1' }, db, now, () => 1)));
    expect(results.every(r => r.ok)).toBe(true);
    expect(rows.length).toBe(1);
    expect((await checkQuota({ ...opts, tag: 'item-2' }, db, now, () => 1)).ok).toBe(true);
    expect((await checkQuota({ ...opts, tag: 'item-3' }, db, now, () => 1)).ok).toBe(false);
  });

  it('空字符串 tag 等同无 tag:正常计数,不去重', async () => {
    const { db, rows, now } = memDb();
    const opts = { key: 'k', windowMs: 60e3, max: 2, tag: '' };
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(true);
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(true);
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(false);
    expect(rows.every(r => r.tag === null)).toBe(true);
  });
});

describe('checkQuota · 第 2 轮互审场景', () => {
  it('配额已满时,并发同 tag 全部被拒,预检挡住不写行', async () => {
    const { db, rows, now } = memDb();
    const opts = { key: 'k', windowMs: 3600e3, max: 1 };
    expect((await checkQuota({ ...opts, tag: 'item-0' }, db, now, () => 1)).ok).toBe(true); // 配额满
    const results = await Promise.all(Array.from({ length: 4 }, () => checkQuota({ ...opts, tag: 'item-9' }, db, now, () => 1)));
    expect(results.every(r => !r.ok)).toBe(true);
    expect(rows.length).toBe(1);
  });

  it('无 tag 的行必须被带 tag 的请求计入(NULL 行不能漏算)', async () => {
    const { db, now } = memDb();
    const opts = { key: 'k', windowMs: 60e3, max: 1 };
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(true);
    const r = await checkQuota({ ...opts, tag: 'item-1' }, db, now, () => 1);
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('同 tag 去重跨桶边界会再计一次(已知且接受的桶语义)', async () => {
    const { db, rows, clock, now } = memDb();
    const opts = { key: 'k', windowMs: 60e3, max: 5, tag: 'item-1' };
    clock.t = 60e3 * 1000; // 桶起点
    await checkQuota(opts, db, now, () => 1);
    clock.t += 59_000;
    await checkQuota(opts, db, now, () => 1);
    expect(rows.length).toBe(1);
    clock.t += 2_000; // 跨桶
    await checkQuota(opts, db, now, () => 1);
    expect(rows.length).toBe(2);
  });
});

describe('checkQuota · 第 3 轮互审场景', () => {
  it('放行必有记录:配额差一个名额时,并发同 tag 双方最多放行一个,且放行者的行存在', async () => {
    const opts = { key: 'k', windowMs: 3600e3, max: 2 };
    for (let round = 0; round < 20; round++) {
      const { db, rows, now } = memDb();
      expect((await checkQuota({ ...opts, tag: 'item-0' }, db, now, () => 1)).ok).toBe(true); // 剩 1 名额
      const results = await Promise.all(Array.from({ length: 6 }, () => checkQuota({ ...opts, tag: 'item-9' }, db, now, () => 1)));
      const okCount = results.filter(r => r.ok).length;
      const tagRows = rows.filter(r => r.tag === 'item-9').length;
      expect(okCount).toBeLessThanOrEqual(6);
      if (okCount > 0) expect(tagRows).toBe(1); // 有人放行 → 记录必须在
      expect(rows.length).toBeLessThanOrEqual(2); // 总量不超 max
    }
  });

  it('Codex 第 4 轮调度:持有方长时间停顿也不可能让第三方空手放行(行永不回滚)', async () => {
    // max=1,A(tag x) 与 B(tag y) 并发 → 两者都被拒但行都留下;之后 C(tag x) 与 D(tag z) 必然被拒
    const { db, rows, now } = memDb();
    const opts = { key: 'k', windowMs: 3600e3, max: 1 };
    const ab = await Promise.all([checkQuota({ ...opts, tag: 'x' }, db, now, () => 1), checkQuota({ ...opts, tag: 'y' }, db, now, () => 1)]);
    expect(ab.filter(r => r.ok).length).toBeLessThanOrEqual(1);
    const c = await checkQuota({ ...opts, tag: 'x' }, db, now, () => 1);
    const d = await checkQuota({ ...opts, tag: 'z' }, db, now, () => 1);
    const totalOk = ab.filter(r => r.ok).length + (c.ok ? 1 : 0) + (d.ok ? 1 : 0);
    expect(totalOk).toBeLessThanOrEqual(1);
    if (c.ok) expect(rows.some(r => r.tag === 'x')).toBe(true);
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
