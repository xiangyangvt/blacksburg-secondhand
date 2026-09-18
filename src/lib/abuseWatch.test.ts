import { describe, it, expect, vi } from 'vitest';
import {
  evaluateReveal, raiseAlert, wideVisitors24h, watchThresholds, blockVisitor, blockedForSec, activeBlocks, unblock, autoBlockEnabled, BLOCK_MS,
  type WatchDb, type WideDb, type BlockDb, type BlockAdminDb,
} from './abuseWatch';
import type { QuotaDb } from './rateLimit';

const T = { lightTargetsPerDay: 10, heavyTargetsPerHour: 30, heavyVisitorsPerIp: 8 };
const VID = '0f1e2d3c-4b5a-6978-8a9b-c0d1e2f3a4b5';

function watchDb(rows: { key: string; tag: string | null }[]): WatchDb {
  return { rateLimitHit: { async findMany({ where }) { return rows.filter(r => r.key === where.key).map(r => ({ tag: r.tag })); } } };
}

function quotaDb(): QuotaDb {
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

describe('evaluateReveal(重线判定,纯读)', () => {
  it('同一访客 1h 内不同目标数:29 不报,30 报;同一目标重复不算', async () => {
    const mk = (n: number) => watchDb([
      ...Array.from({ length: n }, (_, i) => ({ key: `reveal:vid:${VID}:h`, tag: `item:${i}` })),
      { key: `reveal:vid:${VID}:h`, tag: 'item:0' },
    ]);
    expect(await evaluateReveal({ visitorId: VID, ip: '1.1.1.1' }, mk(29), T)).toEqual([]);
    expect(await evaluateReveal({ visitorId: VID, ip: '1.1.1.1' }, mk(30), T)).toEqual([{ kind: 'reveal-wide', subject: VID, count: 30 }]);
  });
  it('同一 IP 1h 内不同访客身份数过线 → 轮换 cookie 告警;同一访客多个目标只算一个身份', async () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => ({ key: 'reveal:ip:9.9.9.9:h', tag: `vid-${i}|item:${i}` })),
      { key: 'reveal:ip:9.9.9.9:h', tag: 'vid-0|item:77' },
    ];
    expect(await evaluateReveal({ visitorId: VID, ip: '9.9.9.9' }, watchDb(rows), T)).toEqual([{ kind: 'reveal-ip-rotation', subject: '9.9.9.9', count: 8 }]);
    expect(await evaluateReveal({ visitorId: VID, ip: '9.9.9.9' }, watchDb(rows.slice(0, 7)), T)).toEqual([]);
  });
});

describe('raiseAlert(重级出口)', () => {
  const alert = { kind: 'reveal-wide' as const, subject: VID, count: 31 };
  it('发一封;同一件事 1 小时内第二次去重;邮件不含 IP 与完整 visitorId', async () => {
    const send = vi.fn(async (_m: { to: string; subject: string; text: string; html: string }) => ({ ok: true as const }));
    const db = quotaDb();
    const env = { ALERT_EMAIL_TO: 'ops@example.test', NEXT_PUBLIC_SITE_URL: 'https://site.test/' } as unknown as NodeJS.ProcessEnv;
    expect(await raiseAlert(alert, { quotaDb: db, send, env })).toBe('sent');
    expect(await raiseAlert(alert, { quotaDb: db, send, env })).toBe('deduped');
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0]![0];
    expect(mail.to).toBe('ops@example.test');
    expect(mail.text).toContain('https://site.test/admin');
    expect(mail.text + mail.html + mail.subject).not.toContain(VID);
  });
  it('收件人:ALERT_EMAIL_TO 未配退到 DIGEST_EMAIL_TO;都没有 → 只打日志不发', async () => {
    const send = vi.fn(async (_m: { to: string; subject: string; text: string; html: string }) => ({ ok: true as const }));
    expect(await raiseAlert(alert, { quotaDb: quotaDb(), send, env: { DIGEST_EMAIL_TO: 'd@example.test' } as unknown as NodeJS.ProcessEnv })).toBe('sent');
    expect(send.mock.calls[0]![0].to).toBe('d@example.test');
    expect(await raiseAlert(alert, { quotaDb: quotaDb(), send, env: {} as NodeJS.ProcessEnv })).toBe('no-recipient');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('发信失败 → failed(不抛)', async () => {
    const send = vi.fn(async (_m: { to: string; subject: string; text: string; html: string }) => ({ ok: false as const, error: 'x' }));
    expect(await raiseAlert(alert, { quotaDb: quotaDb(), send, env: { ALERT_EMAIL_TO: 'a@b.test' } as unknown as NodeJS.ProcessEnv })).toBe('failed');
  });
});

describe('自动处置:暂停访客查看联系方式 24 小时', () => {
  function blockDb() {
    const rows: { id: string; key: string; createdAt: Date }[] = []; let seq = 0; let clock = Date.parse('2026-09-18T12:00:00Z');
    const db: BlockDb & BlockAdminDb = { rateLimitHit: {
      async findFirst({ where }: any) { const r = rows.find(x => x.key === where.key && x.createdAt > where.createdAt.gt); return r ? { id: r.id, admitted: false, createdAt: r.createdAt } : null; },
      async create({ data }: any) { const row = { id: `b${++seq}`, key: data.key, createdAt: new Date(clock) }; rows.push(row); return { id: row.id }; },
      async findMany({ where }: any) { return rows.filter(x => x.key.startsWith(where.key.startsWith) && x.createdAt > where.createdAt.gt).map(x => ({ key: x.key, createdAt: x.createdAt })); },
      async deleteMany({ where }: any) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.key === where.key) rows.splice(i, 1); },
    } as any };
    return { db, rows, now: () => clock, advance: (ms: number) => { clock += ms; } };
  }
  it('暂停后 blockedForSec > 0,24 小时后自动恢复;已暂停不重复写、不延长', async () => {
    const { db, rows, now, advance } = blockDb();
    expect(await blockedForSec(VID, db, now)).toBe(0);
    expect(await blockVisitor(VID, db, now)).toBe(true);
    expect(await blockedForSec(VID, db, now)).toBe(BLOCK_MS / 1000);
    advance(3600e3);
    expect(await blockVisitor(VID, db, now)).toBe(false);
    expect(rows).toHaveLength(1);
    expect(await blockedForSec(VID, db, now)).toBe(BLOCK_MS / 1000 - 3600);
    advance(BLOCK_MS);
    expect(await blockedForSec(VID, db, now)).toBe(0);
  });
  it('后台列表只给 visitor 前 8 位;解除后立即恢复;unblock 只认 block:vid:<uuid>,删不了别的配额行', async () => {
    const { db, rows, now } = blockDb();
    await blockVisitor(VID, db, now);
    rows.push({ id: 'x', key: `reveal:vid:${VID}:h`, createdAt: new Date(now()) });
    const list = await activeBlocks(db, now);
    expect(list.map(b => b.visitor)).toEqual(['0f1e2d3c']);
    await unblock(`reveal:vid:${VID}:h`, db);
    await unblock('block:vid:%', db);
    expect(rows).toHaveLength(2);
    await unblock(list[0]!.key, db);
    expect(await blockedForSec(VID, db, now)).toBe(0);
    expect(rows.map(r => r.key)).toEqual([`reveal:vid:${VID}:h`]);
  });
  it('开关:默认开,ABUSE_AUTO_BLOCK=false 关', () => {
    expect(autoBlockEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(autoBlockEnabled({ ABUSE_AUTO_BLOCK: 'false' } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
  it('邮件如实写处置结果:已暂停 / 只通知', async () => {
    const send = vi.fn(async (_m: { to: string; subject: string; text: string; html: string }) => ({ ok: true as const }));
    const env = { ALERT_EMAIL_TO: 'ops@example.test' } as unknown as NodeJS.ProcessEnv;
    await raiseAlert({ kind: 'reveal-wide', subject: VID, count: 30, blocked: true }, { quotaDb: quotaDb(), send, env });
    await raiseAlert({ kind: 'reveal-ip-rotation', subject: '9.9.9.9', count: 8 }, { quotaDb: quotaDb(), send, env });
    expect(send.mock.calls[0]![0].text).toContain('已自动暂停该访客查看联系方式 24 小时');
    expect(send.mock.calls[1]![0].text).toContain('只通知、不自动处置');
    expect(send.mock.calls[1]![0].text).not.toContain('9.9.9.9');
  });
});

describe('wideVisitors24h(轻级:后台 / 摘要)', () => {
  it('只列过轻线的访客,按目标数降序,visitor 只给前 8 位', async () => {
    const db: WideDb = { rateLimitHit: { async groupBy() { return [
      { key: `reveal:vid:${VID}:d`, _count: { _all: 12 }, _max: { createdAt: new Date('2026-09-18T10:00:00Z') } },
      { key: 'reveal:vid:aaaaaaaa-0000-0000-0000-000000000000:d', _count: { _all: 40 }, _max: { createdAt: null } },
      { key: 'reveal:vid:bbbbbbbb-0000-0000-0000-000000000000:d', _count: { _all: 9 }, _max: { createdAt: new Date() } },
    ]; } } };
    const out = await wideVisitors24h(db, T);
    expect(out.map(v => [v.visitor, v.targets])).toEqual([['aaaaaaaa', 40], ['0f1e2d3c', 12]]);
  });
});

describe('watchThresholds', () => {
  it('env 可覆盖;非法值回默认', () => {
    expect(watchThresholds({} as NodeJS.ProcessEnv)).toEqual(T);
    expect(watchThresholds({ ABUSE_HEAVY_TARGETS_PER_HOUR: '15', ABUSE_LIGHT_TARGETS_PER_DAY: 'abc', ABUSE_HEAVY_VISITORS_PER_IP: '-1' } as unknown as NodeJS.ProcessEnv))
      .toEqual({ ...T, heavyTargetsPerHour: 15 });
  });
});
