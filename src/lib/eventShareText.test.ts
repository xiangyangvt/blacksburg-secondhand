import { describe, it, expect } from 'vitest';
import { buildEventShareText } from './eventShareText';

describe('buildEventShareText', () => {
  const origin = 'https://example.com';
  const base = { id: 'evt1', title: '今晚 8 点麻将', category: 'life' };

  describe('emoji 字典', () => {
    it('life → 🍽️', () => {
      const r = buildEventShareText(base, origin);
      expect(r.startsWith('🍽️ 今晚 8 点麻将')).toBe(true);
    });

    it('exercise → 🏀', () => {
      const r = buildEventShareText({ ...base, category: 'exercise' }, origin);
      expect(r.startsWith('🏀')).toBe(true);
    });

    it('academic → 📚', () => {
      const r = buildEventShareText({ ...base, category: 'academic' }, origin);
      expect(r.startsWith('📚')).toBe(true);
    });

    it('competition → 🏆', () => {
      const r = buildEventShareText({ ...base, category: 'competition' }, origin);
      expect(r.startsWith('🏆')).toBe(true);
    });

    it('other / 未知 / null → 📍 兜底', () => {
      expect(buildEventShareText({ ...base, category: 'other' }, origin).startsWith('📍')).toBe(true);
      expect(buildEventShareText({ ...base, category: 'weird' }, origin).startsWith('📍')).toBe(true);
      expect(buildEventShareText({ ...base, category: null }, origin).startsWith('📍')).toBe(true);
    });

    it('旧 ID 兜底:events / sports / discussion', () => {
      expect(buildEventShareText({ ...base, category: 'events' }, origin).startsWith('🍽️')).toBe(true);
      expect(buildEventShareText({ ...base, category: 'sports' }, origin).startsWith('🏆')).toBe(true);
      expect(buildEventShareText({ ...base, category: 'discussion' }, origin).startsWith('💬')).toBe(true);
    });
  });

  describe('标题已含 emoji 时不再前缀', () => {
    it('🀄️ 开头 → 不重复加 🍽️', () => {
      const r = buildEventShareText({ ...base, title: '🀄️ 今晚 8 点麻将' }, origin);
      // 第一段 = "🀄️ 今晚 8 点麻将"(没多加 emoji)
      const firstSeg = r.split(' · ')[0];
      expect(firstSeg).toBe('🀄️ 今晚 8 点麻将');
    });

    it('普通文字开头 → 加 emoji 前缀', () => {
      const r = buildEventShareText({ ...base, title: '今晚 8 点麻将' }, origin);
      expect(r.split(' · ')[0]).toBe('🍽️ 今晚 8 点麻将');
    });
  });

  describe('状态摘要', () => {
    it('fulfilled / canceled / expired 显终态', () => {
      expect(buildEventShareText({ ...base, status: 'fulfilled' }, origin)).toContain('已结清');
      expect(buildEventShareText({ ...base, status: 'canceled' }, origin)).toContain('已取消');
      expect(buildEventShareText({ ...base, status: 'expired' }, origin)).toContain('已过期');
    });

    it('active + maxAttendees + responseCount → "想凑 N 人 · 已 M 响应"', () => {
      const r = buildEventShareText(
        { ...base, status: 'active', maxAttendees: 4, responseCount: 1 },
        origin,
      );
      expect(r).toContain('想凑 4 人 · 已 1 响应');
    });

    it('active + maxAttendees + 0 响应 → "想凑 N 人"(不含响应数)', () => {
      const r = buildEventShareText(
        { ...base, status: 'active', maxAttendees: 4, responseCount: 0 },
        origin,
      );
      expect(r).toContain('想凑 4 人');
      expect(r).not.toContain('已 0 响应');
    });

    it('active + 无 maxAttendees + responseCount → "已 M 响应"', () => {
      const r = buildEventShareText(
        { ...base, status: 'active', responseCount: 3 },
        origin,
      );
      expect(r).toContain('已 3 响应');
    });

    it('active + 无 maxAttendees + 0 响应 → 不带状态段', () => {
      const r = buildEventShareText(
        { ...base, status: 'active', responseCount: 0 },
        origin,
      );
      // 应该只有 2 段:标题 · url
      expect(r.split(' · ')).toHaveLength(2);
    });
  });

  describe('URL', () => {
    it('结尾是 {origin}/localnews/event/{id}', () => {
      const r = buildEventShareText(base, 'https://blacksburg.example');
      expect(r.endsWith('https://blacksburg.example/localnews/event/evt1')).toBe(true);
    });
  });

  describe('边界', () => {
    it('空 title → "未命名活动" 兜底', () => {
      const r = buildEventShareText({ ...base, title: '' }, origin);
      expect(r).toContain('未命名活动');
    });
  });
});
