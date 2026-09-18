import { describe, it, expect } from 'vitest';
import { contactCandidate, findSellerMatch, contactTag, type ContactSearchDb } from './contactSearch';

describe('contactCandidate', () => {
  it('去首尾空白;太短 / 太长 / 含换行的不当候选', () => {
    expect(contactCandidate('  wx_alice  ')).toBe('wx_alice');
    expect(contactCandidate('+1 540-555-1234')).toBe('+1 540-555-1234');
    for (const bad of [null, undefined, '', 'ab', 'a'.repeat(101), 'wx\nalice']) expect(contactCandidate(bad)).toBeNull();
  });
});

describe('findSellerMatch(整串相等,忽略大小写)', () => {
  const rows = [
    { id: 'i1', contactValue: 'WX_Alice', status: 'active', category: 'home', bumpedAt: 3 },
    { id: 'i4', contactValue: 'wx_alice', status: 'active', category: 'books', bumpedAt: 2 },
    { id: 'i2', contactValue: 'wx_bob', status: 'deleted', category: 'home', bumpedAt: 1 },
    { id: 'i3', contactValue: 'wx_carol', status: 'active', category: 'housing', bumpedAt: 1 },
  ];
  // 模拟数据库:lower(col) = lower(q),只要 active 且非 housing,按 bumpedAt 倒序
  const calls: { sql: string; values: unknown[] }[] = [];
  const db: ContactSearchDb = { async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    calls.push({ sql: strings.join('?'), values });
    const q = String(values[0]).toLowerCase();
    return rows.filter(r => r.contactValue.toLowerCase() === q && r.status === 'active' && r.category !== 'housing')
      .sort((a, b) => b.bumpedAt - a.bumpedAt).map(r => ({ id: r.id, contactValue: r.contactValue })) as any;
  } };

  it('大小写随便写都命中;同一位卖家的几种写法一起带回;锚点是最近活跃的那件', async () => {
    for (const q of ['wx_alice', 'WX_ALICE', 'Wx_Alice']) {
      expect(await findSellerMatch(q, db)).toEqual({ anchorId: 'i1', variants: ['WX_Alice', 'wx_alice'] });
    }
  });
  it('仍然只认整串:前缀、子串、多一个字符都不命中(逐字试不出联系方式)', async () => {
    for (const q of ['wx_', 'WX_ALIC', 'alice', 'wx_alice2', '%', 'wx_alic_']) expect(await findSellerMatch(q, db)).toBeNull();
  });
  it('没有在售物品的卖家、只有已迁走的 housing 帖的卖家不命中', async () => {
    expect(await findSellerMatch('WX_BOB', db)).toBeNull();
    expect(await findSellerMatch('wx_carol', db)).toBeNull();
  });
  it('搜索词只作为参数传入,不拼进 SQL;SQL 两边都套 lower()', async () => {
    calls.length = 0;
    await findSellerMatch(`x' OR '1'='1`, db);
    expect(calls[0]!.values).toEqual([`x' OR '1'='1`]);
    expect(calls[0]!.sql).not.toContain(`OR '1'`);
    expect(calls[0]!.sql).toContain('lower("contactValue") = lower(CAST(? AS TEXT))');
  });
  it('数据库的 lower() 与 JS 不一致时以 JS 为准,宁可少命中', async () => {
    const odd: ContactSearchDb = { async $queryRaw() { return [{ id: 'z', contactValue: 'somebody_else' }] as any; } };
    expect(await findSellerMatch('wx_alice', odd)).toBeNull();
  });
  it('配额 tag 归一成小写:同一位卖家不管怎么写只计一次', () => {
    expect(contactTag('WX_Alice')).toBe('by:wx_alice');
    expect(contactTag('wx_alice')).toBe('by:wx_alice');
  });
});
