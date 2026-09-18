import { describe, it, expect } from 'vitest';
import { newShelfSlug, parseShelfSlug, resolveShelfContact, getOrCreateShelf, SHELF_SLUG_LEN, SHELF_SLUG_RE, type ShelfDb } from './shelf';
import { parseItemsQuery, resolveSeller } from './itemsQuery';

function memDb(items: Record<string, { contactValue: string; status: string }> = {}) {
  const rows: { slug: string; contactValue: string }[] = [];
  const db = {
    shelf: {
      async findUnique({ where }: any) {
        return rows.find(r => ('slug' in where ? r.slug === where.slug : r.contactValue === where.contactValue)) ?? null;
      },
      async create({ data }: any) {
        if (rows.some(r => r.slug === data.slug || r.contactValue === data.contactValue)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        rows.push({ ...data }); return { ...data };
      },
    },
    item: { async findUnique({ where }: any) { return items[where.id] ?? null; } },
  };
  return { db: db as unknown as ShelfDb & { item: any }, rows };
}

describe('slug', () => {
  it('长度固定、只用无歧义字符、通过自身的校验', () => {
    for (let i = 0; i < 50; i++) {
      const s = newShelfSlug();
      expect(s).toHaveLength(SHELF_SLUG_LEN);
      expect(s).toMatch(SHELF_SLUG_RE);
      expect(s).not.toMatch(/[01ilo]/);
    }
  });
  it('parseShelfSlug:大小写 / 空白归一;非法值丢弃(不拿去查库)', () => {
    expect(parseShelfSlug('  AbCd2345 ')).toBe('abcd2345');
    for (const bad of [null, undefined, '', 'abc', 'a'.repeat(17), 'abc-defg', "x' OR 1=1", 'wx:seller_1']) expect(parseShelfSlug(bad)).toBeUndefined();
  });
});

describe('getOrCreateShelf / resolveShelfContact', () => {
  it('同一联系方式永远同一个 slug;slug 反查联系方式;不存在返回 null', async () => {
    const { db, rows } = memDb();
    const a = await getOrCreateShelf('wx_alice', db);
    expect(await getOrCreateShelf('wx_alice', db)).toBe(a);
    expect(rows).toHaveLength(1);
    expect(await resolveShelfContact(a, db)).toBe('wx_alice');
    expect(await resolveShelfContact('nosuchslug', db)).toBeNull();
  });
  it('slug 撞车 → 换一个再试', async () => {
    const { db } = memDb();
    const seq = ['dupdupdu', 'dupdupdu', 'freshone'];
    const a = await getOrCreateShelf('wx_a', db, () => seq.shift()!);
    const b = await getOrCreateShelf('wx_b', db, () => seq.shift()!);
    expect([a, b]).toEqual(['dupdupdu', 'freshone']);
  });
});

describe('resolveSeller(列表 / 搜索 / 对话共用)', () => {
  it('shelf 优先于 sameSellerAs;未知 slug → null(列表返空);都没有 → undefined', async () => {
    const { db } = memDb({ it1: { contactValue: 'wx_bob', status: 'active' } });
    const slug = await getOrCreateShelf('wx_alice', db);
    expect(await resolveSeller(parseItemsQuery(new URLSearchParams(`shelf=${slug}&sameSellerAs=it1`)), db)).toBe('wx_alice');
    expect(await resolveSeller(parseItemsQuery(new URLSearchParams('sameSellerAs=it1')), db)).toBe('wx_bob');
    expect(await resolveSeller(parseItemsQuery(new URLSearchParams('shelf=zzzzzzzz')), db)).toBeNull();
    expect(await resolveSeller(parseItemsQuery(new URLSearchParams('')), db)).toBeUndefined();
    // 非法 slug 在解析阶段就丢掉,等同没传
    expect(parseItemsQuery(new URLSearchParams('shelf=wx:alice')).shelf).toBeUndefined();
  });
});
