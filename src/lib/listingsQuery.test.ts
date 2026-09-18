import { describe, it, expect } from 'vitest';
import { serializePublicListing, serializePublicInquiry } from './listingsQuery';

const SECRETS = ['10.9.8.7', '172.16.0.9', 'wx_poster', 'wx_asker', '$2a$10$hash', 'wx-group', 'Line'];

const row = {
  id: 'l1', type: 'sublet', title: 'Foxridge 2b2b', description: 'd', photoUrls: '["a.jpg"]', areas: '["Foxridge"]',
  budgetMin: 500, budgetMax: 800, smoking: 'no', contactType: 'wechat', contactValue: 'wx_poster', customContactLabel: 'Line',
  editCodeHash: '$2a$10$hash', ipAddress: '10.9.8.7', utmSource: 'wx-group', status: 'active',
  embeddingJson: '[0.1]', embeddedAt: new Date(), embedVersion: 3,
  inquiries: [{
    id: 'q1', itemId: null, listingId: 'l1', contactType: 'wechat', contactValue: 'wx_asker', customContactLabel: 'Line',
    message: '还在吗', sellerReply: null, sellerRepliedAt: null, status: 'active', createdAt: 1, updatedAt: 2,
    ipAddress: '172.16.0.9', utmSource: 'wx-group',
  }],
};

describe('serializePublicListing', () => {
  it('留言不带 IP / utm / 联系方式;listing 不带 hash / IP / utm / 向量字段', () => {
    const out = serializePublicListing(row);
    const json = JSON.stringify(out);
    for (const s of SECRETS) expect(json, `泄露 ${s}`).not.toContain(s);
    expect(json).not.toContain('embeddingJson');
    expect(json).not.toContain('embedVersion');
    expect(Object.keys(out.inquiries[0]).sort()).toEqual([
      'contactType', 'contactValue', 'createdAt', 'customContactLabel', 'id', 'itemId', 'listingId',
      'message', 'sellerRepliedAt', 'sellerReply', 'status', 'updatedAt',
    ]);
  });
  it('展示需要的字段都在:数组已解析,生活习惯 / 预算 / contactType 保留', () => {
    const out = serializePublicListing(row);
    expect(out).toMatchObject({ id: 'l1', photoUrls: ['a.jpg'], areas: ['Foxridge'], budgetMin: 500, smoking: 'no', contactType: 'wechat', contactValue: '', customContactLabel: null });
    expect(out.inquiries[0]).toMatchObject({ id: 'q1', message: '还在吗', contactType: 'wechat', contactValue: '' });
  });
  it('坏 JSON / 无留言不抛', () => {
    const out = serializePublicListing({ ...row, photoUrls: 'x', areas: null, inquiries: undefined });
    expect(out.photoUrls).toEqual([]);
    expect(out.areas).toEqual([]);
    expect(out.inquiries).toEqual([]);
  });
  it('serializePublicInquiry 是纯白名单:多出来的任何字段都不会带出去', () => {
    expect('anythingElse' in serializePublicInquiry({ id: 'x', anythingElse: 'leak', ipAddress: '1.1.1.1' })).toBe(false);
  });
});

import { parseListingsQuery, buildListingsWhere, listingsOrderBy, filterListingsByAreas } from './listingsQuery';

const sp = (s: string) => new URLSearchParams(s);

describe('listings 查询(与旧 GET /api/listings 逐项一致)', () => {
  it('解析:非法 type / 性别 / sort 退回默认;areas 逗号分隔去空', () => {
    expect(parseListingsQuery(sp('type=x&canApplyAs=z&sort=weird&areas=Foxridge,%20,Downtown&q=%20sublet%20'))).toEqual({
      type: undefined, canApplyAs: undefined, areas: ['Foxridge', 'Downtown'], budgetMin: undefined, budgetMax: undefined, q: 'sublet', sort: 'newest',
    });
    expect(parseListingsQuery(sp('type=sublet&canApplyAs=F&budgetMin=400&budgetMax=900&sort=budgetAsc'))).toMatchObject({ type: 'sublet', canApplyAs: 'F', budgetMin: 400, budgetMax: 900, sort: 'budgetAsc' });
  });
  it('where:性别容纳、预算区间相交、关键词 OR', () => {
    expect(buildListingsWhere(parseListingsQuery(sp('')))).toEqual({ status: 'active' });
    expect(buildListingsWhere(parseListingsQuery(sp('canApplyAs=F'))).lookingForGender).toEqual({ in: ['F-only', 'any'] });
    expect(buildListingsWhere(parseListingsQuery(sp('canApplyAs=M'))).lookingForGender).toEqual({ in: ['M-only', 'any'] });
    expect(buildListingsWhere(parseListingsQuery(sp('canApplyAs=nb'))).lookingForGender).toEqual({ in: ['any'] });
    expect(buildListingsWhere(parseListingsQuery(sp('budgetMin=400'))).AND).toEqual([
      { OR: [{ budgetMin: null }, { budgetMin: { lte: Number.MAX_SAFE_INTEGER } }] },
      { OR: [{ budgetMax: null }, { budgetMax: { gte: 400 } }] },
    ]);
    expect(buildListingsWhere(parseListingsQuery(sp('q=sublet'))).OR).toEqual([{ title: { contains: 'sublet' } }, { description: { contains: 'sublet' } }]);
  });
  it('includeKeyword=false:同样过滤条件但不带关键词', () => {
    const q = parseListingsQuery(sp('q=x&type=sublet&budgetMax=900'));
    const { OR: _o, ...rest } = buildListingsWhere(q);
    expect(buildListingsWhere(q, { includeKeyword: false })).toEqual(rest);
  });
  it('orderBy 与 areas JS 过滤', () => {
    expect(listingsOrderBy('newest')).toEqual({ bumpedAt: 'desc' });
    expect(listingsOrderBy('budgetDesc')).toEqual({ budgetMax: 'desc' });
    const rows = [{ id: 'a', areas: '["Foxridge"]' }, { id: 'b', areas: '["Downtown"]' }, { id: 'c', areas: 'bad json' }];
    expect(filterListingsByAreas(rows, []).map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(filterListingsByAreas(rows, ['Foxridge', 'Hethwood']).map(r => r.id)).toEqual(['a']);
  });
});
