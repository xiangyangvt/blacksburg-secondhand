import { describe, it, expect } from 'vitest';
import {
  itemEmbedText, listingEmbedText, eventEmbedText, embedTextFor, MAX_DESC_CHARS,
  ITEM_EMBED_SELECT, LISTING_EMBED_SELECT, EVENT_EMBED_SELECT,
} from './embedText';

// 含联系方式的"脏" fixture:模拟从库里整行取出来的对象。文本构造只按白名单取字段,
// 所以这些值一个都不该出现在输出里。
const SECRETS = {
  wechat: 'wx_seller_8848',
  phone: '540-555-0199',
  email: 'seller@example.com',
  ip: '10.9.8.7',
  hash: '$2a$10$abcdefghijklmnopqrstuv',
  visitor: '0f1e2d3c-4b5a-6978-8a9b-c0d1e2f3a4b5',
};

const dirtyItem = {
  id: 'i1', type: 'sell', title: '二手沙发 sofa', description: '九成新,自取。', price: 35,
  category: 'home', customTag: '家具', contactType: 'wechat',
  contactValue: SECRETS.wechat, customContactLabel: null, photoUrls: '[]', editCodeHash: SECRETS.hash,
  status: 'active', ipAddress: SECRETS.ip, utmSource: 'wx',
};

const dirtyListing = {
  id: 'l1', type: 'sublet', title: 'Foxridge 2b2b 转租', description: '带家具,近公交。', areas: '["Foxridge","Downtown"]',
  budgetMin: 500, budgetMax: 800, hasPlace: true, housingLayout: '2b2b', furnished: true, moveInFuzzy: 'immediate',
  contactType: 'phone', contactValue: SECRETS.phone, customContactLabel: null, editCodeHash: SECRETS.hash,
  ipAddress: SECRETS.ip, posterGender: 'F', lookingForGender: 'any',
};

const dirtyEvent = {
  id: 'e1', title: '周末打网球找搭子', titleOriginal: 'Weekend tennis partner', description: '新手友好。',
  location: 'VT 网球场', category: 'exercise', customCategory: null, startAt: new Date('2026-09-20T14:00:00Z'),
  posterContact: SECRETS.email, posterContactType: 'email', posterCodeHash: SECRETS.hash,
  posterVisitorId: SECRETS.visitor, posterNickname: '小王',
};

function expectNoSecrets(text: string) {
  for (const [k, v] of Object.entries(SECRETS)) {
    expect(text, `输出泄露 ${k}`).not.toContain(v);
  }
}

describe('embedText 白名单', () => {
  it('item:不含联系方式 / IP / hash;含标题与类目中英标签', () => {
    const t = itemEmbedText(dirtyItem);
    expectNoSecrets(t);
    expect(t).toContain('二手沙发 sofa');
    expect(t).toContain('家居家具');
    expect(t).toContain('Home & Furniture');
    expect(t).toContain('$35');
    expect(t).toContain('家具');
  });

  it('listing:不含手机号;含类型、区域、预算', () => {
    const t = listingEmbedText(dirtyListing);
    expectNoSecrets(t);
    expect(t).toContain('转租');
    expect(t).toContain('sublet');
    expect(t).toContain('Foxridge / Downtown');
    expect(t).toContain('$500-$800');
    expect(t).toContain('furnished');
  });

  it('event:不含邮箱 / visitorId;含类别中英、地点、日期、原文标题', () => {
    const t = eventEmbedText(dirtyEvent);
    expectNoSecrets(t);
    expect(t).toContain('运动');
    expect(t).toContain('exercise');
    expect(t).toContain('VT 网球场');
    expect(t).toContain('2026-09-20');
    expect(t).toContain('Weekend tennis partner');
  });

  it('event other 类别用自定义名', () => {
    const t = eventEmbedText({ ...dirtyEvent, category: 'other', customCategory: '桌游' });
    expect(t).toContain('类别 桌游');
  });

  it('embedTextFor 分发一致', () => {
    expect(embedTextFor('item', dirtyItem)).toBe(itemEmbedText(dirtyItem));
    expect(embedTextFor('listing', dirtyListing)).toBe(listingEmbedText(dirtyListing));
    expect(embedTextFor('event', dirtyEvent)).toBe(eventEmbedText(dirtyEvent));
  });
});

describe('embedText 细节', () => {
  it('描述截到 MAX_DESC_CHARS,空白压缩', () => {
    const long = 'x'.repeat(MAX_DESC_CHARS + 500);
    const t = itemEmbedText({ ...dirtyItem, description: `a  b\n\n${long}` });
    expect(t).toContain('a b');
    expect(t.length).toBeLessThan(MAX_DESC_CHARS + 200);
  });

  it('面议价格与求购类型', () => {
    const t = itemEmbedText({ ...dirtyItem, price: null, type: 'buy' });
    expect(t).toContain('面议');
    expect(t).toContain('求购');
  });

  it('listing areas 非法 JSON 不抛', () => {
    expect(() => listingEmbedText({ ...dirtyListing, areas: 'not json' })).not.toThrow();
  });

  it('event 无效日期不输出时间行', () => {
    const t = eventEmbedText({ ...dirtyEvent, startAt: new Date('nope') });
    expect(t).not.toContain('时间');
  });
});

describe('读库 SELECT 白名单本身不含敏感字段', () => {
  const banned = ['contactValue', 'customContactLabel', 'posterContact', 'posterContactLabel', 'ipAddress', 'editCodeHash', 'posterCodeHash', 'posterVisitorId', 'utmSource'];
  it.each([
    ['item', ITEM_EMBED_SELECT], ['listing', LISTING_EMBED_SELECT], ['event', EVENT_EMBED_SELECT],
  ] as const)('%s', (_k, sel) => {
    for (const b of banned) expect(Object.keys(sel)).not.toContain(b);
  });
});
