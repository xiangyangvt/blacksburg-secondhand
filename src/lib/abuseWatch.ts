// Sprint 11D:异常侦测与分级提醒
//
// 取舍原则(Sean 2026-09-18):正常用户的操作做到丝滑,不靠预先加限制;滥用靠**埋点侦测 + 分级提醒**兜底。
//   轻 → 后台面板 + 每日摘要,站长周期性查看
//   重 → 立即发邮件,同一件事 1 小时内只发一封;**同时自动处置**(Sean 2026-09-18 拍板)
// 自动处置 = 暂停该**访客**查看联系方式 24 小时(gateReveal 直接 429),后台「异常访问」小节可一键解除。
//   - 只处置「同一访客大范围查看」这一种。「同一 IP 多个访客身份」**只通知不处置**:校园 NAT 下一个 IP 背后是很多真人,
//     封 IP 会误伤一片;而且轮换 cookie 的人本来就被 IP 小时配额(60)框住了
//   - 只停「查看联系方式」这一个动作,浏览、搜索、发帖不受影响
//   - `ABUSE_AUTO_BLOCK=false` 可整体关掉,退回只通知
//   - 封禁记录就放在配额表里(key = `block:vid:<visitorId>`),不加新表;48 小时清理逻辑会自然回收
//
// 信号来自 9A 的披露配额流水(RateLimitHit):每次"把一条联系方式交给客户端"都在 `reveal:vid:<visitor>:h|d`
// 与 `reveal:ip:<ip>:h` 下留一行,tag = 目标(`item:<id>` / `by:<value>` …)。以前摘要只数**被拒**次数——
// 把速度压在配额以内的慢速抓取测不到。这里数的是**放行与被拒都算**的「不同目标数」。
//
// 阈值是猜的,上线后按真实数据调(env 可覆盖)。

import { prisma } from './prisma';
import { checkQuota, type QuotaDb } from './rateLimit';
import { sendEmail } from './email';

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const SCAN_CAP = 500;

export interface WatchThresholds {
  /** 轻:同一访客 24h 内查看的不同目标数 ≥ 即进后台 / 摘要 */
  lightTargetsPerDay: number;
  /** 重:同一访客 1h 内查看的不同目标数 ≥ 即发邮件 */
  heavyTargetsPerHour: number;
  /** 重:同一 IP 1h 内出现的不同访客身份数 ≥ 即发邮件(轮换 cookie) */
  heavyVisitorsPerIp: number;
}

export function watchThresholds(env: NodeJS.ProcessEnv = process.env): WatchThresholds {
  const num = (k: string, d: number) => { const n = Number(env[k]); return Number.isFinite(n) && n > 0 ? n : d; };
  return {
    lightTargetsPerDay: num('ABUSE_LIGHT_TARGETS_PER_DAY', 10),
    // 默认 30 = 访客小时配额(REVEAL_LIMITS.visitorPerHour):正常人到不了,到了就是把配额吃满
    heavyTargetsPerHour: num('ABUSE_HEAVY_TARGETS_PER_HOUR', 30),
    // 校园 NAT 下同一 IP 有多个真人很正常,所以这个数给得宽
    heavyVisitorsPerIp: num('ABUSE_HEAVY_VISITORS_PER_IP', 8),
  };
}

export interface WatchDb {
  rateLimitHit: {
    findMany(args: { where: { key: string; createdAt: { gt: Date } }; select: { tag: true }; take: number }): Promise<{ tag: string | null }[]>;
  };
}

export type AlertKind = 'reveal-wide' | 'reveal-ip-rotation';
export interface AbuseAlert { kind: AlertKind; subject: string; count: number; /** 本次是否已自动暂停该访客 */ blocked?: boolean }

/** 纯读:根据流水判断这次披露之后是否越过「重」线。不写库、不发信 */
export async function evaluateReveal(
  who: { visitorId: string; ip: string },
  db: WatchDb = prisma as unknown as WatchDb,
  t: WatchThresholds = watchThresholds(),
  now: () => number = Date.now,
): Promise<AbuseAlert[]> {
  const since = new Date(now() - HOUR);
  const [byVisitor, byIp] = await Promise.all([
    db.rateLimitHit.findMany({ where: { key: `reveal:vid:${who.visitorId}:h`, createdAt: { gt: since } }, select: { tag: true }, take: SCAN_CAP }),
    db.rateLimitHit.findMany({ where: { key: `reveal:ip:${who.ip}:h`, createdAt: { gt: since } }, select: { tag: true }, take: SCAN_CAP }),
  ]);
  const out: AbuseAlert[] = [];
  const targets = new Set(byVisitor.map(r => r.tag).filter(Boolean)).size;
  if (targets >= t.heavyTargetsPerHour) out.push({ kind: 'reveal-wide', subject: who.visitorId, count: targets });
  // IP 流水的 tag 是 `${visitorId}|${target}`(contactQuota.ts)
  const visitors = new Set(byIp.map(r => r.tag?.split('|')[0]).filter(Boolean)).size;
  if (visitors >= t.heavyVisitorsPerIp) out.push({ kind: 'reveal-ip-rotation', subject: who.ip, count: visitors });
  return out;
}

const TITLES: Record<AlertKind, string> = {
  'reveal-wide': '同一访客 1 小时内查看了大量不同卖家的联系方式',
  'reveal-ip-rotation': '同一 IP 1 小时内出现大量不同访客身份在查看联系方式',
};

export interface AlertDeps {
  quotaDb?: QuotaDb;
  send?: typeof sendEmail;
  env?: NodeJS.ProcessEnv;
}

/**
 * 「重」级告警出口。去重用配额表本身:`alert:<kind>:<subject>` 每小时 1 次,抢到名额的那次才发信。
 * 邮件里**不放 IP 与完整 visitorId**(邮件要过第三方):只放类型、数量、后台链接;细节在 /admin 看。
 * 收件人:`ALERT_EMAIL_TO`,未配则退到 `DIGEST_EMAIL_TO`;都没配只打日志。
 */
export async function raiseAlert(a: AbuseAlert, deps: AlertDeps = {}): Promise<'sent' | 'deduped' | 'no-recipient' | 'failed'> {
  const env = deps.env ?? process.env;
  const q = await checkQuota({ key: `alert:${a.kind}:${a.subject}`, windowMs: HOUR, max: 1 }, deps.quotaDb);
  if (!q.ok) return 'deduped';
  const to = env.ALERT_EMAIL_TO || env.DIGEST_EMAIL_TO;
  const site = (env.NEXT_PUBLIC_SITE_URL || 'https://blacksburg-secondhand-production.up.railway.app').replace(/\/$/, '');
  const line = `${TITLES[a.kind]}(${a.count})`;
  const action = a.blocked
    ? '已自动暂停该访客查看联系方式 24 小时(其他功能不受影响)。如果是误伤,到后台「异常访问」小节点「解除」。'
    : '这一类只通知、不自动处置。';
  console.warn(`[abuseWatch] ${line} · ${a.kind === 'reveal-wide' ? `visitor ${a.subject.slice(0, 8)}…` : 'ip(见后台)'}`);
  if (!to) return 'no-recipient';
  const text = `${line}\n\n${action}\n后台「异常访问」小节看细节:\n${site}/admin`;
  const r = await (deps.send ?? sendEmail)({
    to, subject: `[黑堡站 · 需要处理] ${TITLES[a.kind]}`, text,
    html: `<div style="font:14px/1.6 -apple-system,sans-serif;color:#333"><p><strong>${line}</strong></p><p>${action}</p><p><a href="${site}/admin">打开后台「异常访问」小节</a></p></div>`,
  });
  return r.ok ? 'sent' : 'failed';
}

// ---------- 自动处置:暂停访客查看联系方式 ----------

export const BLOCK_MS = DAY;
const blockKey = (visitorId: string) => `block:vid:${visitorId}`;

export function autoBlockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ABUSE_AUTO_BLOCK !== 'false';
}

export interface BlockDb {
  rateLimitHit: {
    findFirst(args: { where: { key: string; createdAt: { gt: Date } }; select: { id: true; admitted: true; createdAt: true } }): Promise<{ id: string; admitted: boolean; createdAt: Date } | null>;
    create(args: { data: { key: string; tag: string | null; bucket: number | null }; select: { id: true } }): Promise<{ id: string }>;
  };
}

/** 该访客还要被暂停多少秒;0 = 没被暂停。gateReveal 每次都查(一次按 key 的索引查询) */
export async function blockedForSec(visitorId: string, db: BlockDb = prisma as unknown as BlockDb, now: () => number = Date.now): Promise<number> {
  const t = now();
  const row = await db.rateLimitHit.findFirst({ where: { key: blockKey(visitorId), createdAt: { gt: new Date(t - BLOCK_MS) } }, select: { id: true, admitted: true, createdAt: true } });
  return row ? Math.max(1, Math.ceil((row.createdAt.getTime() + BLOCK_MS - t) / 1000)) : 0;
}

/** 暂停 24 小时。已在暂停中则不重复写(不延长)。返回是否新写入 */
export async function blockVisitor(visitorId: string, db: BlockDb = prisma as unknown as BlockDb, now: () => number = Date.now): Promise<boolean> {
  if (await blockedForSec(visitorId, db, now) > 0) return false;
  await db.rateLimitHit.create({ data: { key: blockKey(visitorId), tag: null, bucket: null }, select: { id: true } });
  return true;
}

export interface ActiveBlock { key: string; visitor: string; since: Date; until: Date }

export interface BlockAdminDb {
  rateLimitHit: {
    findMany(args: { where: { key: { startsWith: string }; createdAt: { gt: Date } }; select: { key: true; createdAt: true }; orderBy: { createdAt: 'desc' }; take: number }): Promise<{ key: string; createdAt: Date }[]>;
    deleteMany(args: { where: { key: string } }): Promise<unknown>;
  };
}

/** 后台用:当前生效的暂停。visitor 只给前 8 位;key 是解除时的句柄 */
export async function activeBlocks(db: BlockAdminDb = prisma as unknown as BlockAdminDb, now: () => number = Date.now): Promise<ActiveBlock[]> {
  const rows = await db.rateLimitHit.findMany({ where: { key: { startsWith: 'block:vid:' }, createdAt: { gt: new Date(now() - BLOCK_MS) } }, select: { key: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  return rows.map(r => ({ key: r.key, visitor: r.key.slice('block:vid:'.length, 'block:vid:'.length + 8), since: r.createdAt, until: new Date(r.createdAt.getTime() + BLOCK_MS) }));
}

/** 后台「解除」。只接受 block:vid: 前缀的 key,防止这个入口被拿去删别的配额行 */
export async function unblock(key: string, db: BlockAdminDb = prisma as unknown as BlockAdminDb): Promise<void> {
  if (!/^block:vid:[0-9a-f-]{36}$/i.test(key)) return;
  await db.rateLimitHit.deleteMany({ where: { key } });
}

/** gateReveal 之后调用,fire-and-forget:侦测失败绝不影响正常请求 */
export function observeReveal(who: { visitorId: string; ip: string }): void {
  void (async () => {
    try {
      for (const a of await evaluateReveal(who)) {
        // 先处置再通知:邮件里要如实写「已暂停」。IP 轮换那一类不处置(见文件头)
        if (a.kind === 'reveal-wide' && autoBlockEnabled()) {
          await blockVisitor(a.subject);
          a.blocked = true;
        }
        await raiseAlert(a);
      }
    } catch (e) {
      console.warn('[abuseWatch] 侦测失败(忽略):', (e as Error)?.message ?? e);
    }
  })();
}

// ---------- 轻:后台面板 / 每日摘要 ----------

export interface WideVisitor { visitor: string; targets: number; lastAt: Date }

export interface WideDb {
  rateLimitHit: {
    groupBy(args: {
      by: ['key']; where: { key: { startsWith: string; endsWith: string }; createdAt: { gt: Date } };
      _count: { _all: true }; _max: { createdAt: true };
    }): Promise<{ key: string; _count: { _all: number }; _max: { createdAt: Date | null } }[]>;
  };
}

/**
 * 24h 内查看不同目标数 ≥ 轻阈值的访客。`reveal:vid:<id>:d` 下同 tag 在窗口内只留一行(配额去重),
 * 所以行数 ≈ 不同目标数(被拒的重试会多出几行,偏严,可接受)。visitor 只给前 8 位。
 */
export async function wideVisitors24h(
  db: WideDb = prisma as unknown as WideDb,
  t: WatchThresholds = watchThresholds(),
  now: () => number = Date.now,
): Promise<WideVisitor[]> {
  const rows = await db.rateLimitHit.groupBy({
    by: ['key'],
    where: { key: { startsWith: 'reveal:vid:', endsWith: ':d' }, createdAt: { gt: new Date(now() - DAY) } },
    _count: { _all: true }, _max: { createdAt: true },
  });
  return rows
    .filter(r => r._count._all >= t.lightTargetsPerDay)
    .map(r => ({ visitor: r.key.slice('reveal:vid:'.length, 'reveal:vid:'.length + 8), targets: r._count._all, lastAt: r._max.createdAt ?? new Date(0) }))
    .sort((a, b) => b.targets - a.targets)
    .slice(0, 50);
}
