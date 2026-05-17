// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';

import {
  getNickname, setNickname,
  getLastContact, setLastContact,
  getLastEventTemplate, setLastEventTemplate,
} from './eventNickname';

describe('eventNickname helpers (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('nickname', () => {
    it('空 storage 返 null', () => {
      expect(getNickname()).toBeNull();
    });

    it('set 后 get 拿到', () => {
      setNickname('Alice');
      expect(getNickname()).toBe('Alice');
    });

    it('trim + 截到 20 字', () => {
      setNickname('  Alice  ');
      expect(getNickname()).toBe('Alice');
      setNickname('a'.repeat(30));
      expect(getNickname()).toHaveLength(20);
    });

    it('空字符串 → null', () => {
      setNickname('');
      expect(getNickname()).toBeNull();
    });
  });

  describe('last contact', () => {
    it('空 storage 返 null', () => {
      expect(getLastContact()).toBeNull();
    });

    it('保存 + 读回 完整对象', () => {
      setLastContact({ contactType: 'wechat', contact: 'zhang3' });
      const r = getLastContact();
      expect(r).toEqual({ contactType: 'wechat', contact: 'zhang3' });
    });

    it('contactLabel 字段保留', () => {
      setLastContact({ contactType: 'other', contact: 'line_id', contactLabel: 'Line' });
      expect(getLastContact()?.contactLabel).toBe('Line');
    });

    it('损坏 JSON 返 null,不抛', () => {
      localStorage.setItem('hb_last_contact', 'not json');
      expect(getLastContact()).toBeNull();
    });
  });

  describe('event template ("再发一次" 用)', () => {
    const template = {
      title: '今晚 8 点麻将',
      category: 'life',
      customCategory: null,
      description: '凑 4 人',
      startAt: '2026-05-20T20:00:00.000Z',
      endAt: null,
      location: 'Chinese Hub',
      maxAttendees: 4,
    };

    it('空 storage 返 null', () => {
      expect(getLastEventTemplate()).toBeNull();
    });

    it('保存 + 读回', () => {
      setLastEventTemplate(template);
      expect(getLastEventTemplate()).toEqual(template);
    });

    it('损坏 JSON 返 null', () => {
      localStorage.setItem('hb_event_last_template', 'not json {');
      expect(getLastEventTemplate()).toBeNull();
    });

    it('title 缺失的 stale 数据 → 拒绝(返 null)', () => {
      localStorage.setItem('hb_event_last_template', JSON.stringify({ category: 'life' }));
      expect(getLastEventTemplate()).toBeNull();
    });
  });
});
