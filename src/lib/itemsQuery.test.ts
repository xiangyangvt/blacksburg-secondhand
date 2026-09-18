import { describe, it, expect } from 'vitest';
import { parseItemsQuery, buildItemsWhere, itemsOrderBy, resolveSellerContact, serializePublicItem } from './itemsQuery';

const sp = (s: string) => new URLSearchParams(s);

describe('parseItemsQuery(与旧 /api/items 逐项一致)', () => {
  it('默认值', () => {
    expect(parseItemsQuery(sp(''))).toEqual({
      type: undefined, category: undefined, q: undefined, sameSellerAs: undefined,
      minPrice: undefined, maxPrice: undefined, since: undefined, sort: 'newest',
    });
  });
  it('非法值退回默认;housing 类目不接受;q 去空白', () => {
    const q = parseItemsQuery(sp('type=x&category=housing&sort=weird&q=%20sofa%20'));
    expect(q.type).toBeUndefined();
    expect(q.category).toBeUndefined();
    expect(q.sort).toBe('newest');
    expect(q.q).toBe('sofa');
  });
  it('since:与旧 route 一致 —— all / 空 = 不过滤;1d / 1w 各自;其余任何值都按 30 天(旧行为原样保留)', () => {
    const now = () => 1_000_000_000_000;
    const day = 86400e3;
    expect(buildItemsWhere(parseItemsQuery(sp('since=all')), { now }).createdAt).toBeUndefined();
    expect(buildItemsWhere(parseItemsQuery(sp('')), { now }).createdAt).toBeUndefined();
    expect(buildItemsWhere(parseItemsQuery(sp('since=1d')), { now }).createdAt).toEqual({ gte: new Date(now() - day) });
    expect(buildItemsWhere(parseItemsQuery(sp('since=1w')), { now }).createdAt).toEqual({ gte: new Date(now() - 7 * day) });
    expect(buildItemsWhere(parseItemsQuery(sp('since=1m')), { now }).createdAt).toEqual({ gte: new Date(now() - 30 * day) });
    expect(buildItemsWhere(parseItemsQuery(sp('since=2y')), { now }).createdAt).toEqual({ gte: new Date(now() - 30 * day) });
  });
  it('合法值原样', () => {
    const q = parseItemsQuery(sp('type=buy&category=books&minPrice=10&maxPrice=50&since=1w&sort=priceAsc&sameSellerAs=abc'));
    expect(q).toMatchObject({ type: 'buy', category: 'books', minPrice: 10, maxPrice: 50, since: '1w', sort: 'priceAsc', sameSellerAs: 'abc' });
  });
});

describe('buildItemsWhere', () => {
  it('基础:active + 排除 housing', () => {
    expect(buildItemsWhere(parseItemsQuery(sp('')))).toEqual({ status: 'active', NOT: { category: 'housing' } });
  });
  it('关键词 OR 只匹配标题 / 描述 / 标签,不匹配联系方式', () => {
    const w = buildItemsWhere(parseItemsQuery(sp('q=sofa')));
    expect(w.OR).toEqual([{ title: { contains: 'sofa' } }, { description: { contains: 'sofa' } }, { customTag: { contains: 'sofa' } }]);
    expect(JSON.stringify(w)).not.toContain('contactValue');
  });
  it('includeKeyword=false:同样的过滤条件但不带关键词(语义路候选)', () => {
    const q = parseItemsQuery(sp('q=sofa&type=sell&category=home&minPrice=10&maxPrice=50'));
    const a = buildItemsWhere(q, { includeKeyword: true });
    const b = buildItemsWhere(q, { includeKeyword: false });
    expect(b.OR).toBeUndefined();
    const { OR: _drop, ...rest } = a;
    expect(b).toEqual(rest);
  });
  it('价格区间 NaN 不写;since 用注入的 now', () => {
    const now = () => 1_000_000_000_000;
    const w = buildItemsWhere({ sort: 'newest', minPrice: NaN, maxPrice: 50, since: '1d' }, { now });
    expect(w.price).toEqual({ lte: 50 });
    expect(w.createdAt).toEqual({ gte: new Date(1_000_000_000_000 - 86400e3) });
  });
  it('sellerContact 写进 where', () => {
    expect(buildItemsWhere({ sort: 'newest' }, { sellerContact: 'wx_x' }).contactValue).toBe('wx_x');
  });
});

describe('itemsOrderBy', () => {
  it('newest = bumpedAt desc;其余按字段', () => {
    expect(itemsOrderBy('newest')).toEqual({ bumpedAt: 'desc' });
    expect(itemsOrderBy('oldest')).toEqual({ createdAt: 'asc' });
    expect(itemsOrderBy('priceAsc')).toEqual({ price: 'asc' });
    expect(itemsOrderBy('priceDesc')).toEqual({ price: 'desc' });
  });
});

describe('resolveSellerContact', () => {
  const db = (row: { contactValue: string; status: string } | null) => ({ item: { findUnique: async () => row } });
  it('未请求 → undefined;锚点不存在 / 非 active → null;否则联系方式', async () => {
    expect(await resolveSellerContact(undefined, db({ contactValue: 'x', status: 'active' }))).toBeUndefined();
    expect(await resolveSellerContact('a', db(null))).toBeNull();
    expect(await resolveSellerContact('a', db({ contactValue: 'x', status: 'deleted' }))).toBeNull();
    expect(await resolveSellerContact('a', db({ contactValue: 'wx', status: 'active' }))).toBe('wx');
  });
});

describe('serializePublicItem 白名单', () => {
  it('不带 hash / IP / utm / 联系方式 / 向量;留言脱敏', () => {
    const out = serializePublicItem({
      id: 'i', title: 't', photoUrls: '["a"]', editCodeHash: 'h', ipAddress: '1.1.1.1', utmSource: 'wx',
      contactValue: 'wx_secret', customContactLabel: 'L', embeddingJson: '[1]', embeddedAt: new Date(), embedVersion: 2,
      inquiries: [{ id: 'q', itemId: 'i', listingId: null, contactType: 'wechat', contactValue: 'inq_secret', customContactLabel: 'x', message: 'm', sellerReply: null, sellerRepliedAt: null, status: 'active', createdAt: 1, updatedAt: 2, ipAddress: '2.2.2.2' }],
    });
    const json = JSON.stringify(out);
    for (const s of ['wx_secret', 'inq_secret', '1.1.1.1', '2.2.2.2', '"h"', 'embeddingJson', 'embedVersion']) expect(json).not.toContain(s);
    expect(out.photoUrls).toEqual(['a']);
    expect(out.contactValue).toBe('');
    expect(out.inquiries[0].contactValue).toBe('');
  });
});
