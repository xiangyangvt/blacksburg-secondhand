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

/** 从浏览器环境拿 origin；服务端兜底空字符串（生成时调用方需自己补 origin） */
export function clientOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}
