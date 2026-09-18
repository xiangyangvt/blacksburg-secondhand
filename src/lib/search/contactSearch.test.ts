import { describe, it, expect } from 'vitest';
import { contactCandidate, findSellerAnchor, type ContactSearchDb } from './contactSearch';

describe('contactCandidate', () => {
  it('去首尾空白;太短 / 太长 / 含换行的不当候选', () => {
    expect(contactCandidate('  wx_alice  ')).toBe('wx_alice');
    expect(contactCandidate('+1 540-555-1234')).toBe('+1 540-555-1234');
    for (const bad of [null, undefined, '', 'ab', 'a'.repeat(101), 'wx\nalice']) expect(contactCandidate(bad)).toBeNull();
  });
});

describe('findSellerAnchor', () => {
  const rows = [
    { id: 'i1', contactValue: 'wx_alice', status: 'active', category: 'home' },
    { id: 'i2', contactValue: 'wx_bob', status: 'deleted', category: 'home' },
    { id: 'i3', contactValue: 'wx_carol', status: 'active', category: 'housing' },
  ];
  const db: ContactSearchDb = { item: { async findFirst({ where }) {
    const r = rows.find(x => x.contactValue === where.contactValue && x.status === where.status && x.category !== where.NOT.category);
    return r ? { id: r.id } : null;
  } } };
  it('只认**整串相等**:前缀、子串、大小写不同都不命中(不能逐字试出联系方式)', async () => {
    expect(await findSellerAnchor('wx_alice', db)).toBe('i1');
    for (const q of ['wx_', 'wx_alic', 'alice', 'WX_ALICE', 'wx_alice2']) expect(await findSellerAnchor(q, db)).toBeNull();
  });
  it('没有在售物品的卖家、只有已迁走的 housing 帖的卖家不命中', async () => {
    expect(await findSellerAnchor('wx_bob', db)).toBeNull();
    expect(await findSellerAnchor('wx_carol', db)).toBeNull();
  });
});
