// 把商品组装成"微信复制 → 粘贴 → 别人能看懂"的纯文本
// 链接默认带 utm_source=share 便于后台统计分享带量
//
// OG_VERSION = 给分享链接附加的 cache-buster query。微信对一个 URL 抓 OG 后会
// 缓存最长 7 天，如果首次抓取时 OG 还没接好（无图/无描述），后面改了 OG 微信
// 也不会重新抓。每次大改 OG 后 bump 这个版本号，新分享链接的 URL 就跟旧缓存
// 不同，微信会重新抓一遍。
const OG_VERSION = '5';

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
  // 扁平化分享：URL 指向主页 + ?focus=ID
  // 接收者打开看到的是平台首页 + 该商品自动展开，符合"网站只有一个主页"的产品哲学
  // /item/[id] 路由仍保留（旧分享链接兼容），但新分享不再生成
  const url = `${opts.origin}/?focus=${opts.itemId}&utm_source=${encodeURIComponent(source)}&og=v${OG_VERSION}`;
  return `${headline}\n${url}`;
}

/** 给主页生成可分享文本 */
export function buildSiteShareText(opts: {
  origin: string;
  source?: string;
}): string {
  const source = opts.source ?? 'share';
  const url = `${opts.origin}/?utm_source=${encodeURIComponent(source)}&og=v${OG_VERSION}`;
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
  // 分享链接走 /listing/[id]：该路由 generateMetadata 含同源 og:image（微信卡有图）；
  // 用户实际打开后 server-side redirect 到 /roommates?focus=ID，保持扁平化体验
  const url = `${opts.origin}/listing/${opts.listingId}?utm_source=${encodeURIComponent(source)}&og=v${OG_VERSION}`;
  return `${headline}\n${url}`;
}

/** 从浏览器环境拿 origin；服务端兜底空字符串（生成时调用方需自己补 origin） */
export function clientOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}
