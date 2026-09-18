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
  revealWideVisitors24h: 0,
  feedbackOpen: 0,
  aiCostUsd: 0,
  aiBudgetTripped: false,
  ai: { day: '2026-09-16', costUsd: 0, calls: 0, rejected429: 0, rejected503: 0, todayCostUsd: 0 },
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
  it('用户反馈 ≥1 报 review;阈值 0 关闭(11E)', () => {
    const d = { ...base, feedbackOpen: 2 };
    expect(evaluateThresholds(d, DEFAULT_THRESHOLDS, SITE).map(x => x.task)).toEqual(['用户反馈待回复']);
    expect(evaluateThresholds(d, { ...DEFAULT_THRESHOLDS, feedback: 0 }, SITE)).toEqual([]);
  });
  it('大范围查看联系方式的访客 ≥1 报 review;阈值 0 关闭(11D)', () => {
    const d = { ...base, revealWideVisitors24h: 2 };
    expect(evaluateThresholds(d, DEFAULT_THRESHOLDS, SITE).map(x => x.task)).toEqual(['有访客大范围查看联系方式']);
    expect(evaluateThresholds(d, { ...DEFAULT_THRESHOLDS, wideReveal: 0 }, SITE)).toEqual([]);
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

describe('10D:AI 费用进摘要', () => {
  const withAi = (costUsd: number, tripped = false): Digest => ({
    ...base, aiCostUsd: costUsd, aiBudgetTripped: tripped,
    ai: { day: '2026-09-16', costUsd, calls: 40, rejected429: 2, rejected503: tripped ? 5 : 0, todayCostUsd: 0.1 },
  });
  it('默认阈值 1 美元:昨日费用 ≤ 1 不报,> 1 报', () => {
    expect(evaluateThresholds(withAi(0.8), DEFAULT_THRESHOLDS, SITE)).toHaveLength(0);
    expect(evaluateThresholds(withAi(1), DEFAULT_THRESHOLDS, SITE)).toHaveLength(0);
    const alerts = evaluateThresholds(withAi(1.25), DEFAULT_THRESHOLDS, SITE);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'decision', task: 'AI 费用偏高', ref: `${SITE}/admin` });
    expect(alerts[0]!.note).toContain('$1.2500');
    expect(alerts[0]!.note).toContain('429 2 次');
  });
  it('触发过预算熔断:费用没过阈值也报', () => {
    const alerts = evaluateThresholds(withAi(0.3, true), DEFAULT_THRESHOLDS, SITE);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.task).toBe('AI 预算熔断');
    expect(alerts[0]!.note).toContain('503 5 次');
  });
  it('阈值 0 = 关闭(与其他项一致);极小阈值 = 有任何费用就报', () => {
    expect(evaluateThresholds(withAi(5, true), { ...DEFAULT_THRESHOLDS, aiCost: 0 }, SITE)).toHaveLength(0);
    expect(evaluateThresholds(withAi(0.0007), { ...DEFAULT_THRESHOLDS, aiCost: 0.000001 }, SITE)).toHaveLength(1);
  });
  it('parseThresholds 认 aiCost;邮件总览含 AI 一行', () => {
    expect(parseThresholds(new URLSearchParams('aiCost=0.5')).aiCost).toBe(0.5);
    expect(parseThresholds(new URLSearchParams('')).aiCost).toBe(1);
    const d = withAi(1.25);
    const mail = renderDigestEmail(d, evaluateThresholds(d, DEFAULT_THRESHOLDS, SITE), SITE);
    expect(mail.text).toContain('AI 2026-09-16 $1.2500 / 40 次调用');
    expect(mail.html).toContain('AI 费用偏高');
  });
});
