import { describe, it, expect } from 'vitest';
import { buildEventsBaseWhere, buildEventsWhere, isRetiredCategory, serializePublicEvent } from './eventsQuery';

describe('events 查询(与旧 GET /api/events 逐项一致)', () => {
  const NOW = 1_800_000_000_000;
  it('base:active + 质量分 + 排除 reddit 源与退役类目 + 未过期三种情况', () => {
    expect(buildEventsBaseWhere(NOW)).toEqual({
      status: 'active',
      qualityScore: { gte: 0.5 },
      source: { notIn: ['reddit_vt', 'reddit_nrv'] },
      category: { notIn: ['discussion', 'news'] },
      OR: [{ endAt: { gte: new Date(NOW) } }, { endAt: null, startAt: { gte: new Date(NOW - 86400000) } }, { startAt: null }],
    });
  });
  it('category:新旧 ID 都匹配;无别名的原样', () => {
    expect(buildEventsWhere('life', NOW).category).toEqual({ in: ['life', 'events'] });
    expect(buildEventsWhere('competition', NOW).category).toEqual({ in: ['competition', 'sports'] });
    expect(buildEventsWhere('exercise', NOW).category).toEqual({ in: ['exercise'] });
    expect(buildEventsWhere(null, NOW)).toEqual(buildEventsBaseWhere(NOW));
  });
  it('退役类目', () => {
    expect(isRetiredCategory('discussion')).toBe(true);
    expect(isRetiredCategory('news')).toBe(true);
    expect(isRetiredCategory('life')).toBe(false);
    expect(isRetiredCategory(null)).toBe(false);
  });
});

describe('serializePublicEvent', () => {
  const row = {
    id: 'e1', title: 't', photoUrls: '["a.jpg"]', posterCodeHash: '$2a$10$hash', posterVisitorId: '0f1e2d3c-vid',
    posterContact: 'wx_poster', posterContactType: 'wechat', posterContactLabel: 'L', posterContactPublic: false,
    posterNickname: '小王', embeddingJson: '[1]', embeddedAt: new Date(), embedVersion: 2,
  };
  it('非公开联系方式置 null;hash / visitorId / 向量字段不出网', () => {
    const out = serializePublicEvent(row, 3);
    const json = JSON.stringify(out);
    for (const s of ['$2a$10$hash', '0f1e2d3c-vid', 'wx_poster', 'embeddingJson', 'embedVersion', 'embeddedAt']) expect(json).not.toContain(s);
    expect(out).toMatchObject({ id: 'e1', photoUrls: ['a.jpg'], posterContact: null, posterContactType: null, posterNickname: '小王', responseCount: 3 });
  });
  it('公开联系方式保留(发布者自己选择公开)', () => {
    expect(serializePublicEvent({ ...row, posterContactPublic: true }).posterContact).toBe('wx_poster');
  });
  it('坏 photoUrls 不抛', () => {
    expect(serializePublicEvent({ ...row, photoUrls: '{oops' }).photoUrls).toEqual([]);
  });
});
