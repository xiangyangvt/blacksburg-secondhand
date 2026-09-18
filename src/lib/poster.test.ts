import { describe, it, expect } from 'vitest';
import { clip, posterPhotoUrl, toPosterRow, pageSlice, pageCount, glyphSet, posterHeight, POSTER_PAGE_SIZE, ROW_HEIGHT, HEADER_HEIGHT, FOOTER_HEIGHT } from './poster';

const base = { id: 'i1', type: 'sell', title: '书桌', description: '八成新', price: 35, category: 'home', customTag: null, photoUrls: '[]' };

describe('clip(按显示宽度)', () => {
  it('不超不动;全角 1、半角 0.55;超出加省略号;空白归一', () => {
    expect(clip('  书桌\n 白色 ', 10)).toBe('书桌 白色');
    expect(clip('好'.repeat(20), 16)).toBe(`${'好'.repeat(15)}…`);
    // 半角字符更窄:同样 16 个单位能放下更多字母
    expect(clip('a'.repeat(40), 16).length).toBeGreaterThan(20);
    expect(clip('a'.repeat(40), 16).endsWith('…')).toBe(true);
  });
  it('不切坏 emoji(代理对)', () => {
    const out = clip('🛋️'.repeat(30), 5);
    expect(out.endsWith('…')).toBe(true);
    expect(/[\ud800-\udbff]$/.test(out.slice(0, -1))).toBe(false);
  });
});

describe('posterPhotoUrl', () => {
  it('Cloudinary → 方形 jpg 小图(satori 不认 webp / avif);其他域名一律 null(服务端会去取图,防 SSRF)', () => {
    expect(posterPhotoUrl('https://res.cloudinary.com/demo/image/upload/v1/items/a.webp'))
      .toBe('https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_360,h_360,q_auto:good,f_jpg/v1/items/a.webp');
    for (const bad of ['https://example.com/a.jpg', 'http://169.254.169.254/latest/meta-data', 'https://res.cloudinary.com.evil.test/x/image/upload/a.jpg', 'https://res.cloudinary.com/demo/image/upload/../../x', 'https://res.cloudinary.com/demo/image/upload/a.jpg?x=@evil']) {
      expect(posterPhotoUrl(bad)).toBeNull();
    }
  });
});

describe('toPosterRow', () => {
  it('原样取字段:类型、价格、标签(自定义优先)、首图;不含联系方式', () => {
    const r = toPosterRow({ ...base, customTag: '乐器', photoUrls: JSON.stringify(['https://example.com/1.jpg', 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg']) });
    expect(r).toEqual({ id: 'i1', typeLabel: '出售', title: '书桌', priceText: '$35', tag: '乐器', info: '八成新', photo: 'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_360,h_360,q_auto:good,f_jpg/v1/a.jpg' });
    expect(Object.keys(r).some(k => /contact/i.test(k))).toBe(false);
  });
  it('面议 / 求购留言;类目中文名;坏 photoUrls / 非 https 当无图', () => {
    expect(toPosterRow({ ...base, price: null }).priceText).toBe('面议');
    expect(toPosterRow({ ...base, type: 'buy', price: null })).toMatchObject({ typeLabel: '求购', priceText: '留言' });
    expect(toPosterRow(base).tag).toBe('家居家具');
    expect(toPosterRow({ ...base, photoUrls: 'not json' }).photo).toBeNull();
    expect(toPosterRow({ ...base, photoUrls: '["javascript:alert(1)","http://x/a.jpg"]' }).photo).toBeNull();
  });
});

describe('分页与尺寸', () => {
  it('每张最多 POSTER_PAGE_SIZE 件;越界页钳到合法范围', () => {
    const rows = Array.from({ length: POSTER_PAGE_SIZE * 2 + 3 }, (_, i) => i);
    expect(pageCount(rows.length)).toBe(3);
    expect(pageSlice(rows, 1).rows).toHaveLength(POSTER_PAGE_SIZE);
    expect(pageSlice(rows, 3).rows).toEqual([20, 21, 22]);
    expect(pageSlice(rows, 99).page).toBe(3);
    expect(pageSlice(rows, NaN).page).toBe(1);
    expect(pageSlice(rows, -2).page).toBe(1);
    expect(pageCount(0)).toBe(1);
  });
  it('高度 = 头 + 行 × n + 尾', () => {
    expect(posterHeight(4)).toBe(HEADER_HEIGHT + 4 * ROW_HEIGHT + FOOTER_HEIGHT);
  });
  it('glyphSet 去重、去空白', () => {
    expect(glyphSet(['书桌 书', 'ab a'])).toBe(['a', 'b', '书', '桌'].sort().join(''));
  });
});
