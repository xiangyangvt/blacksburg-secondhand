// 把商品组装成"微信复制 → 粘贴 → 别人能看懂"的纯文本
// 链接默认带 utm_source=share 便于后台统计分享带量

import { itemCopyText } from './utils';
import type { ItemType } from './utils';

/** 给单条商品生成可分享文本（标题 — $价格\n链接） */
export function buildItemShareText(opts: {
  title: string;
  price: number | null;
  itemType: ItemType;
  category?: string;
  origin: string;          // e.g. "https://blacksburg-secondhand-production.up.railway.app"
  itemId: string;
  source?: string;         // utm_source 值，默认 'share'
}): string {
  const source = opts.source ?? 'share';
  const headline = itemCopyText(opts.title, opts.price, opts.itemType, opts.category);
  const url = `${opts.origin}/item/${opts.itemId}?utm_source=${encodeURIComponent(source)}`;
  return `${headline}\n${url}`;
}

/** 给主页生成可分享文本 */
export function buildSiteShareText(opts: {
  origin: string;
  source?: string;
}): string {
  const source = opts.source ?? 'share';
  const url = `${opts.origin}/?utm_source=${encodeURIComponent(source)}`;
  // 中文友好的一句话介绍
  return `黑堡二手买卖 · 本地华人/学生免登录二手平台\n${url}`;
}

/** 给单条 listing 生成可分享文本（类型 · 标题 · 预算 · 区域 + 链接） */
export function buildListingShareText(opts: {
  title: string;
  listingType: string;     // 'find_roommate' | 'co_rent' | 'sublet' | 'summer'
  typeLabel: string;       // 中文 label，例 "有房找室友"
  budgetMin: number | null;
  budgetMax: number | null;
  areas: string[];
  origin: string;
  listingId: string;
  source?: string;
}): string {
  const source = opts.source ?? 'share';
  const budgetStr =
    opts.budgetMin === null && opts.budgetMax === null ? '面议'
    : opts.budgetMin !== null && opts.budgetMax !== null && opts.budgetMin === opts.budgetMax ? `$${opts.budgetMin}/月`
    : opts.budgetMin !== null && opts.budgetMax !== null ? `$${opts.budgetMin}–${opts.budgetMax}/月`
    : opts.budgetMin !== null ? `$${opts.budgetMin}+/月`
    : `≤$${opts.budgetMax}/月`;

  const areaStr = opts.areas.length > 0 ? ' · ' + opts.areas.slice(0, 2).join('/') : '';
  const headline = `【${opts.typeLabel}】${opts.title} · ${budgetStr}${areaStr}`;
  const url = `${opts.origin}/roommates?listing=${opts.listingId}&utm_source=${encodeURIComponent(source)}`;
  return `${headline}\n${url}`;
}

/** 从浏览器环境拿 origin；服务端兜底空字符串（生成时调用方需自己补 origin） */
export function clientOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}
