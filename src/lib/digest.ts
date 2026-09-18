// 维护摘要(Sprint 9D):把"需要人处理的状态"算出来、判阈值、渲染成一屏邮件。
// 不变量(ARCHITECTURE.md §8.10):每一种需要人处理的状态都必须有一条出站路径。
// 纯函数部分(evaluateThresholds / renderDigestEmail)可单测;computeDigest 读数据库与文件。

import { readFile } from 'node:fs/promises';
import { prisma } from '@/lib/prisma';
import { usageSummary, dayKey } from '@/lib/llmUsage';

export type Digest = {
  generatedAt: string;
  reportsPending: number;
  /** Sprint 11E:未处理的用户反馈 / 问站长条数 */
  feedbackOpen: number;
  hidden: { items: number; listings: number; inquiries: number };
  scraper: { failedInLast15: number; lastRunAt: string | null; lastSuccessAt: string | null; failingSources: string[] };
  lastBackupAt: string | null;
  backupAgeDays: number | null;
  revealRejects24h: number;
  /** Sprint 10D:昨日(UTC)AI 估算费用(美元)与是否触发过预算熔断;今日至今的数也带上,方便手动查看 */
  aiCostUsd: number;
  aiBudgetTripped: boolean;
  ai: { day: string; costUsd: number; calls: number; rejected429: number; rejected503: number; todayCostUsd: number };
};

/** 阈值:0 = 该项关闭 */
export type Thresholds = {
  reports: number;      // 举报队列条数 ≥ 即报
  feedback: number;     // 未处理的用户反馈条数 ≥ 即报
  hidden: number;       // 隐藏队列总数 ≥ 即报(默认关:隐藏是持久状态,天天报会疲劳)
  scraperFails: number; // 最近 15 次里失败次数 ≥ 即报
  backupDays: number;   // 距上次备份天数 ≥ 即报
  rejects: number;      // 24h 内联系方式披露被拒次数 ≥ 即报(疑似批量抓取)
  aiCost: number;       // 昨日 AI 费用(美元)> 即报;触发过预算熔断也报。与其他项一致:0 = 关闭
};

export const DEFAULT_THRESHOLDS: Thresholds = { reports: 1, feedback: 1, hidden: 0, scraperFails: 3, backupDays: 8, rejects: 50, aiCost: 1 };

/** 与注意力账本 needs-you 对齐:kind + ref + note */
export type Alert = { kind: 'review' | 'decision'; ref: string; task: string; note: string };

export function parseThresholds(sp: URLSearchParams): Thresholds {
  const num = (k: keyof Thresholds) => {
    const v = sp.get(k);
    if (v === null || v === '') return DEFAULT_THRESHOLDS[k];
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_THRESHOLDS[k];
  };
  return { reports: num('reports'), feedback: num('feedback'), hidden: num('hidden'), scraperFails: num('scraperFails'), backupDays: num('backupDays'), rejects: num('rejects'), aiCost: num('aiCost') };
}

export function evaluateThresholds(d: Digest, t: Thresholds, siteUrl: string): Alert[] {
  const admin = `${siteUrl}/admin`;
  const out: Alert[] = [];
  if (t.reports > 0 && d.reportsPending >= t.reports) {
    out.push({ kind: 'review', ref: admin, task: '举报队列待处理', note: `${d.reportsPending} 条举报等待判定` });
  }
  if (t.feedback > 0 && d.feedbackOpen >= t.feedback) {
    out.push({ kind: 'review', ref: admin, task: '用户反馈待回复', note: `${d.feedbackOpen} 条用户反馈 / 提问等待处理` });
  }
  const hiddenTotal = d.hidden.items + d.hidden.listings + d.hidden.inquiries;
  if (t.hidden > 0 && hiddenTotal >= t.hidden) {
    out.push({ kind: 'review', ref: admin, task: '隐藏队列待清理', note: `商品 ${d.hidden.items} · 室友 ${d.hidden.listings} · 留言 ${d.hidden.inquiries}` });
  }
  if (t.scraperFails > 0 && d.scraper.failedInLast15 >= t.scraperFails) {
    out.push({ kind: 'decision', ref: admin, task: 'scraper 连续失败', note: `最近 15 次失败 ${d.scraper.failedInLast15} 次;源:${d.scraper.failingSources.join(', ') || '—'};最后成功 ${d.scraper.lastSuccessAt ?? '无记录'}` });
  }
  if (t.backupDays > 0 && (d.backupAgeDays === null || d.backupAgeDays >= t.backupDays)) {
    out.push({ kind: 'decision', ref: `${siteUrl}`.replace(/\/$/, '') + '/admin', task: '备份未按时运行', note: d.lastBackupAt ? `上次备份 ${d.lastBackupAt},已 ${d.backupAgeDays} 天` : '找不到 last-backup.txt' });
  }
  if (t.rejects > 0 && d.revealRejects24h >= t.rejects) {
    out.push({ kind: 'review', ref: admin, task: '联系方式披露被拒次数异常', note: `24h 内 ${d.revealRejects24h} 次 429,疑似批量抓取` });
  }
  if (t.aiCost > 0 && (d.aiCostUsd > t.aiCost || d.aiBudgetTripped)) {
    out.push({
      kind: 'decision', ref: admin, task: d.aiBudgetTripped ? 'AI 预算熔断' : 'AI 费用偏高',
      note: `${d.ai.day} 费用 $${d.aiCostUsd.toFixed(4)} · 调用 ${d.ai.calls} 次 · 429 ${d.ai.rejected429} 次 · 503 ${d.ai.rejected503} 次${d.aiBudgetTripped ? '(当日触发过熔断,第 2 层对话曾被关闭)' : ''}`,
    });
  }
  return out;
}

export function renderDigestEmail(d: Digest, alerts: Alert[], siteUrl: string): { subject: string; text: string; html: string } {
  const subject = `[黑堡站] ${alerts.length} 项需要处理 · ${d.generatedAt.slice(0, 10)}`;
  const lines = alerts.map(a => `• ${a.task}:${a.note}\n  → ${a.ref}`);
  const summary = [
    `举报 ${d.reportsPending} · 反馈 ${d.feedbackOpen} · 隐藏 ${d.hidden.items}/${d.hidden.listings}/${d.hidden.inquiries} · scraper 近 15 次失败 ${d.scraper.failedInLast15}`,
    `备份 ${d.lastBackupAt ?? '无'}(${d.backupAgeDays ?? '?'} 天前) · 24h 披露被拒 ${d.revealRejects24h}`,
    `AI ${d.ai.day} $${d.aiCostUsd.toFixed(4)} / ${d.ai.calls} 次调用 · 429 ${d.ai.rejected429} · 503 ${d.ai.rejected503}`,
  ];
  const text = [`需要处理(${alerts.length}):`, ...lines, '', '总览:', ...summary, '', `后台:${siteUrl}/admin`].join('\n');
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const html = `<div style="font:14px/1.5 -apple-system,sans-serif;color:#333">
<p><strong>需要处理(${alerts.length})</strong></p>
<ul>${alerts.map(a => `<li><strong>${esc(a.task)}</strong>:${esc(a.note)}<br><a href="${a.ref}">${esc(a.ref)}</a></li>`).join('')}</ul>
<p style="color:#666">${summary.map(esc).join('<br>')}</p>
<p><a href="${siteUrl}/admin">打开后台</a></p></div>`;
  return { subject, text, html };
}

export async function computeDigest(now: Date = new Date()): Promise<Digest> {
  const dayAgo = new Date(now.getTime() - 24 * 3600e3);
  const [reportsPending, hiddenItems, hiddenListings, hiddenInquiries, runs, rejects, feedbackOpen] = await Promise.all([
    prisma.report.count(),
    prisma.item.count({ where: { status: 'hidden' } }),
    prisma.listing.count({ where: { status: 'hidden' } }),
    prisma.inquiry.count({ where: { status: 'hidden' } }),
    prisma.scrapeRun.findMany({ orderBy: { startedAt: 'desc' }, take: 15, select: { source: true, status: true, startedAt: true } }),
    prisma.rateLimitHit.count({ where: { key: { startsWith: 'reveal:' }, admitted: false, createdAt: { gt: dayAgo } } }),
    // 反馈表读不到不该让整个摘要失败(新表,生产 db push 之前可能还不存在)
    prisma.feedback.count({ where: { status: 'open' } }).catch(() => 0),
  ]);
  // 10D:昨日(UTC)AI 用量。计费表读不到不该让整个摘要失败——摘要本身就是故障出口
  const yesterday = dayKey(new Date(now.getTime() - 24 * 3600e3));
  const empty = { costUsd: 0, calls: 0, chatCalls: 0, embedCalls: 0, unsettled: 0, rejected429: 0, rejected503: 0 };
  const [aiY, aiT] = await Promise.all([
    usageSummary(yesterday).catch(() => empty),
    usageSummary(dayKey(now)).catch(() => empty),
  ]);

  const failed = runs.filter(r => r.status === 'failed');
  const lastSuccess = runs.find(r => r.status === 'success');

  let lastBackupAt: string | null = null;
  try {
    const txt = await readFile('.github/last-backup.txt', 'utf8');
    const m = txt.match(/(\d{4}-\d{2}-\d{2}T[\d:]+Z)/);
    if (m) lastBackupAt = m[1];
  } catch { /* 文件不存在:当作没有备份记录 */ }
  const backupAgeDays = lastBackupAt ? Math.floor((now.getTime() - Date.parse(lastBackupAt)) / 86400e3) : null;

  return {
    generatedAt: now.toISOString(),
    reportsPending,
    feedbackOpen,
    hidden: { items: hiddenItems, listings: hiddenListings, inquiries: hiddenInquiries },
    scraper: {
      failedInLast15: failed.length,
      lastRunAt: runs[0]?.startedAt.toISOString() ?? null,
      lastSuccessAt: lastSuccess?.startedAt.toISOString() ?? null,
      failingSources: Array.from(new Set(failed.map(r => r.source))),
    },
    lastBackupAt,
    backupAgeDays,
    revealRejects24h: rejects,
    aiCostUsd: aiY.costUsd,
    aiBudgetTripped: aiY.rejected503 > 0,
    ai: { day: yesterday, costUsd: aiY.costUsd, calls: aiY.calls, rejected429: aiY.rejected429, rejected503: aiY.rejected503, todayCostUsd: aiT.costUsd },
  };
}
