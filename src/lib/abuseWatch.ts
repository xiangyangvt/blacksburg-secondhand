// Sprint 11D:异常侦测与分级提醒
//
// 取舍原则(Sean 2026-09-18):正常用户的操作做到丝滑,不靠预先加限制;滥用靠**埋点侦测 + 分级提醒**兜底。
//   轻 → 后台面板 + 每日摘要,站长周期性查看
//   重 → 立即发邮件,同一件事 1 小时内只发一封
// **只通知,不自动处置**(不封人、不降配额):先看过几次真实告警,再决定哪些值得自动化。
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
export interface AbuseAlert { kind: AlertKind; subject: string; count: number }

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
  console.warn(`[abuseWatch] ${line} · ${a.kind === 'reveal-wide' ? `visitor ${a.subject.slice(0, 8)}…` : 'ip(见后台)'}`);
  if (!to) return 'no-recipient';
  const text = `${line}\n\n目前只通知、不自动处置。到后台「异常访问」小节看细节:\n${site}/admin`;
  const r = await (deps.send ?? sendEmail)({
    to, subject: `[黑堡站 · 需要处理] ${TITLES[a.kind]}`, text,
    html: `<div style="font:14px/1.6 -apple-system,sans-serif;color:#333"><p><strong>${line}</strong></p><p>目前只通知、不自动处置。</p><p><a href="${site}/admin">打开后台「异常访问」小节</a></p></div>`,
  });
  return r.ok ? 'sent' : 'failed';
}

/** gateReveal 之后调用,fire-and-forget:侦测失败绝不影响正常请求 */
export function observeReveal(who: { visitorId: string; ip: string }): void {
  void (async () => {
    try {
      for (const a of await evaluateReveal(who)) await raiseAlert(a);
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
