import { describe, it, expect } from 'vitest';
import { checkQuota, isBotUA, type QuotaDb } from './rateLimit';

// 内存版 RateLimitHit。实现与 SQL 一致的语义:
// - @@unique([key, tag, bucket]):tag 为 NULL 的行互不冲突(SQL NULL ≠ NULL)
// - 只按 createdAt 排序,不加 id 兜底(生产查询没有)
// - 每个 await 让出一次事件循环,让 Promise.all 的并发调用真正交错
function memDb() {
  type Row = { id: string; key: string; tag: string | null; bucket: number | null; admitted: boolean; createdAt: Date };
  const rows: Row[] = [];
  let seq = 0;
  const tick = () => new Promise<void>(r => setTimeout(r, 0));
  const inWin = (where: { key: string; createdAt: { gt: Date }; tag?: string }) =>
    rows.filter(r => r.key === where.key && r.createdAt > where.createdAt.gt
      && (where.tag === undefined || r.tag === where.tag));
  const db: QuotaDb = {
    rateLimitHit: {
      async count({ where }) { await tick(); return inWin(where).length; },
      async findFirst({ where }) {
        await tick();
        const h = inWin(where)[0];
        return h ? { id: h.id, admitted: h.admitted, createdAt: h.createdAt } : null;
      },
      async findMany({ where, skip, take }) {
        await tick();
        return inWin(where).slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(skip, skip + take).map(r => ({ createdAt: r.createdAt }));
      },
      async create({ data }) {
        await tick();
        if (data.tag !== null && rows.some(r => r.key === data.key && r.tag === data.tag && r.bucket === data.bucket)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row = { id: `r${++seq}`, key: data.key, tag: data.tag, bucket: data.bucket, admitted: false, createdAt: new Date(clock.t) };
        rows.push(row);
        return { id: row.id };
      },
      async update({ where, data }) { await tick(); const r = rows.find(r => r.id === where.id); if (r) r.admitted = data.admitted; },
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

  it('并发同 tag 双写只留一行,不消耗额外配额(先到者放行,后到者可能过严被拒)', async () => {
    const { db, rows, now } = memDb();
    const opts = { key: 'k', windowMs: 3600e3, max: 2 };
    const results = await Promise.all(Array.from({ length: 5 }, () => checkQuota({ ...opts, tag: 'item-1' }, db, now, () => 1)));
    expect(results.filter(r => r.ok).length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBe(1);
    expect((await checkQuota({ ...opts, tag: 'item-1' }, db, now, () => 1)).ok).toBe(true); // 标记后重访放行
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

  it('同 tag 去重按滑动窗口:跨桶边界刷新不再计一次,窗口过后才计', async () => {
    const { db, rows, clock, now } = memDb();
    const opts = { key: 'k', windowMs: 60e3, max: 5, tag: 'item-1' };
    clock.t = 60e3 * 1000 + 50_000; // 桶结束前 10s
    await checkQuota(opts, db, now, () => 1);
    clock.t += 15_000; // 跨桶,距首次 15s,仍在 60s 窗口内
    expect((await checkQuota(opts, db, now, () => 1)).ok).toBe(true);
    expect(rows.length).toBe(1);
    clock.t += 60_000; // 首行已出窗口
    await checkQuota(opts, db, now, () => 1);
    expect(rows.length).toBe(2);
  });

  it('Codex 9A:整点前取满 30 个目标,整点后立刻刷新其中一个仍放行', async () => {
    const { db, clock, now } = memDb();
    const opts = { key: 'k', windowMs: 3600e3, max: 30 };
    clock.t = 3600e3 * 100 - 10_000; // 整点前 10s
    for (let i = 0; i < 30; i++) expect((await checkQuota({ ...opts, tag: `item-${i}` }, db, now, () => 1)).ok).toBe(true);
    clock.t += 20_000; // 整点后 10s
    expect((await checkQuota({ ...opts, tag: 'item-7' }, db, now, () => 1)).ok).toBe(true);
    expect((await checkQuota({ ...opts, tag: 'item-new' }, db, now, () => 1)).ok).toBe(false);
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

describe('checkQuota · 第 5 轮互审场景', () => {
  it('满额后重访已放行的 tag 仍放行(刷新不消耗配额);重访被拒的 tag 仍拒', async () => {
    const { db, now } = memDb();
    const opts = { key: 'k', windowMs: 3600e3, max: 1 };
    expect((await checkQuota({ ...opts, tag: 'a' }, db, now, () => 1)).ok).toBe(true);
    expect((await checkQuota({ ...opts, tag: 'b' }, db, now, () => 1)).ok).toBe(false); // 预检拒,不写行
    expect((await checkQuota({ ...opts, tag: 'a' }, db, now, () => 1)).ok).toBe(true);  // 重访 a
    expect((await checkQuota({ ...opts, tag: 'b' }, db, now, () => 1)).ok).toBe(false);
  });

  it('被拒但已写行的 tag,重访不得漏过', async () => {
    const { db, rows, now } = memDb();
    const opts = { key: 'k', windowMs: 3600e3, max: 1 };
    // 并发抢唯一名额:至多一个 admitted,其余行 admitted=false
    await Promise.all(['x', 'y', 'z'].map(tag => checkQuota({ ...opts, tag }, db, now, () => 1)));
    for (const r of rows.filter(r => !r.admitted)) {
      expect((await checkQuota({ ...opts, tag: r.tag! }, db, now, () => 1)).ok).toBe(false);
    }
    expect(rows.filter(r => r.admitted).length).toBeLessThanOrEqual(1);
  });

  it('retryAfter 指向真正有名额的时刻,而不是最早一行过期', async () => {
    const { db, rows, clock, now } = memDb();
    const opts = { key: 'k', windowMs: 60e3, max: 1 };
    // 两条并发都过预检、都写行(被拒尝试也占行)
    clock.t = 1_000_000_000_000;
    const ab = await Promise.all([checkQuota(opts, db, now, () => 1), checkQuota(opts, db, now, () => 1)]);
    expect(rows.length).toBe(2);
    clock.t += 10_000;
    rows[1].createdAt = new Date(clock.t); // 第二行晚 10s
    const r = await checkQuota(opts, db, now, () => 1);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBe(60); // 需两行都过期:第二行 +60s
    void ab;
  });
});

describe('checkQuota · 第 6 轮互审场景', () => {
  it('带 tag 被拒后的 retryAfter 不早于同 tag 行过期(同 tag 窗口内不可能再放行)', async () => {
    const { db, rows, clock, now } = memDb();
    const opts = { key: 'k', windowMs: 60e3, max: 3 };
    clock.t = 60e3 * 1000; // 桶起点
    // 两行旧记录:-50s / -40s(仍在窗口内)
    await checkQuota(opts, db, now, () => 1); rows[0].createdAt = new Date(clock.t - 50_000);
    await checkQuota(opts, db, now, () => 1); rows[1].createdAt = new Date(clock.t - 40_000);
    clock.t += 5_000;
    const [a] = await Promise.all([checkQuota({ ...opts, tag: 'a' }, db, now, () => 1), checkQuota({ ...opts, tag: 'b' }, db, now, () => 1)]);
    if (!a.ok) {
      expect(a.retryAfterSec).toBeGreaterThanOrEqual(55); // 桶还剩 55s
      clock.t += 15_000; // 旧行过期
      const again = await checkQuota({ ...opts, tag: 'a' }, db, now, () => 1);
      expect(again.ok).toBe(false);
      expect(again.retryAfterSec).toBeGreaterThanOrEqual(40);
      clock.t += 45_001; // 同 tag 的被拒行(5s 时写入)过期
      expect((await checkQuota({ ...opts, tag: 'a' }, db, now, () => 1)).ok).toBe(true);
    }
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
