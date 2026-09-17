import { describe, it, expect } from 'vitest';
import { evaluateThresholds, renderDigestEmail, parseThresholds, DEFAULT_THRESHOLDS, type Digest } from './digest';

const base: Digest = {
  generatedAt: '2026-09-17T13:00:00.000Z',
  reportsPending: 0,
  hidden: { items: 0, listings: 0, inquiries: 0 },
  scraper: { failedInLast15: 0, lastRunAt: null, lastSuccessAt: '2026-09-17T12:00:00.000Z', failingSources: [] },
  lastBackupAt: '2026-09-14T06:00:00.000Z',
  backupAgeDays: 3,
  revealRejects24h: 0,
};
const SITE = 'https://example.test';

describe('evaluateThresholds', () => {
  it('一切正常 → 无告警(正常日不发邮件)', () => {
    expect(evaluateThresholds(base, DEFAULT_THRESHOLDS, SITE)).toEqual([]);
  });
  it('举报 ≥1 报 review;隐藏默认关闭不报', () => {
    const a = evaluateThresholds({ ...base, reportsPending: 2, hidden: { items: 5, listings: 0, inquiries: 0 } }, DEFAULT_THRESHOLDS, SITE);
    expect(a.map(x => x.task)).toEqual(['举报队列待处理']);
    expect(a[0].kind).toBe('review');
    expect(a[0].ref).toBe(`${SITE}/admin`);
  });
  it('scraper 失败 ≥3、备份 ≥8 天、被拒 ≥50 各自触发;阈值 0 关闭', () => {
    const d = { ...base, scraper: { ...base.scraper, failedInLast15: 3, failingSources: ['hokiesports'] }, backupAgeDays: 9, revealRejects24h: 50 };
    expect(evaluateThresholds(d, DEFAULT_THRESHOLDS, SITE).map(x => x.task)).toEqual(['scraper 连续失败', '备份未按时运行', '联系方式披露被拒次数异常']);
    expect(evaluateThresholds(d, { ...DEFAULT_THRESHOLDS, scraperFails: 0, backupDays: 0, rejects: 0 }, SITE)).toEqual([]);
  });
  it('找不到备份记录 → 报', () => {
    expect(evaluateThresholds({ ...base, lastBackupAt: null, backupAgeDays: null }, DEFAULT_THRESHOLDS, SITE).map(x => x.task)).toEqual(['备份未按时运行']);
  });
});

describe('parseThresholds', () => {
  it('缺省用默认;非法值回默认;0 有效', () => {
    const t = parseThresholds(new URLSearchParams('reports=3&hidden=abc&rejects=0'));
    expect(t).toEqual({ ...DEFAULT_THRESHOLDS, reports: 3, rejects: 0 });
  });
});

describe('renderDigestEmail', () => {
  it('一屏内,每条带后台链接,html 转义', () => {
    const alerts = evaluateThresholds({ ...base, reportsPending: 1, scraper: { ...base.scraper, failedInLast15: 4, failingSources: ['a<b'] } }, DEFAULT_THRESHOLDS, SITE);
    const m = renderDigestEmail(base, alerts, SITE);
    expect(m.subject).toContain('2 项需要处理');
    expect(m.text.split('\n').length).toBeLessThan(20);
    expect(m.text).toContain(`${SITE}/admin`);
    expect(m.html).toContain('a&lt;b');
    expect(m.html).not.toContain('a<b');
  });
});
