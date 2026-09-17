// 维护摘要(Sprint 9D):把"需要人处理的状态"算出来、判阈值、渲染成一屏邮件。
// 不变量(ARCHITECTURE.md §8.10):每一种需要人处理的状态都必须有一条出站路径。
// 纯函数部分(evaluateThresholds / renderDigestEmail)可单测;computeDigest 读数据库与文件。

import { readFile } from 'node:fs/promises';
import { prisma } from '@/lib/prisma';

export type Digest = {
  generatedAt: string;
  reportsPending: number;
  hidden: { items: number; listings: number; inquiries: number };
  scraper: { failedInLast15: number; lastRunAt: string | null; lastSuccessAt: string | null; failingSources: string[] };
  lastBackupAt: string | null;
  backupAgeDays: number | null;
  revealRejects24h: number;
};

/** 阈值:0 = 该项关闭 */
export type Thresholds = {
  reports: number;      // 举报队列条数 ≥ 即报
  hidden: number;       // 隐藏队列总数 ≥ 即报(默认关:隐藏是持久状态,天天报会疲劳)
  scraperFails: number; // 最近 15 次里失败次数 ≥ 即报
  backupDays: number;   // 距上次备份天数 ≥ 即报
  rejects: number;      // 24h 内联系方式披露被拒次数 ≥ 即报(疑似批量抓取)
};

export const DEFAULT_THRESHOLDS: Thresholds = { reports: 1, hidden: 0, scraperFails: 3, backupDays: 8, rejects: 50 };

/** 与注意力账本 needs-you 对齐:kind + ref + note */
export type Alert = { kind: 'review' | 'decision'; ref: string; task: string; note: string };

export function parseThresholds(sp: URLSearchParams): Thresholds {
  const num = (k: keyof Thresholds) => {
    const v = sp.get(k);
    if (v === null || v === '') return DEFAULT_THRESHOLDS[k];
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_THRESHOLDS[k];
  };
  return { reports: num('reports'), hidden: num('hidden'), scraperFails: num('scraperFails'), backupDays: num('backupDays'), rejects: num('rejects') };
}

export function evaluateThresholds(d: Digest, t: Thresholds, siteUrl: string): Alert[] {
  const admin = `${siteUrl}/admin`;
  const out: Alert[] = [];
  if (t.reports > 0 && d.reportsPending >= t.reports) {
    out.push({ kind: 'review', ref: admin, task: '举报队列待处理', note: `${d.reportsPending} 条举报等待判定` });
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
  return out;
}

export function renderDigestEmail(d: Digest, alerts: Alert[], siteUrl: string): { subject: string; text: string; html: string } {
  const subject = `[黑堡站] ${alerts.length} 项需要处理 · ${d.generatedAt.slice(0, 10)}`;
  const lines = alerts.map(a => `• ${a.task}:${a.note}\n  → ${a.ref}`);
  const summary = [
    `举报 ${d.reportsPending} · 隐藏 ${d.hidden.items}/${d.hidden.listings}/${d.hidden.inquiries} · scraper 近 15 次失败 ${d.scraper.failedInLast15}`,
    `备份 ${d.lastBackupAt ?? '无'}(${d.backupAgeDays ?? '?'} 天前) · 24h 披露被拒 ${d.revealRejects24h}`,
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
  const [reportsPending, hiddenItems, hiddenListings, hiddenInquiries, runs, rejects] = await Promise.all([
    prisma.report.count(),
    prisma.item.count({ where: { status: 'hidden' } }),
    prisma.listing.count({ where: { status: 'hidden' } }),
    prisma.inquiry.count({ where: { status: 'hidden' } }),
    prisma.scrapeRun.findMany({ orderBy: { startedAt: 'desc' }, take: 15, select: { source: true, status: true, startedAt: true } }),
    prisma.rateLimitHit.count({ where: { key: { startsWith: 'reveal:' }, admitted: false, createdAt: { gt: dayAgo } } }),
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
  };
}
