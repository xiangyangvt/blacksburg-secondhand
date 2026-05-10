// 通用工具函数 — 部分函数接受 locale 参数支持中英切换

import type { Locale, MessageKey } from '@/i18n/messages';
import { messages } from '@/i18n/messages';

export const CATEGORIES = [
  { id: 'home',        i18nKey: 'cat.home'        as const },
  { id: 'electronics', i18nKey: 'cat.electronics' as const },
  { id: 'transport',   i18nKey: 'cat.transport'   as const },
  { id: 'books',       i18nKey: 'cat.books'       as const },
  { id: 'other',       i18nKey: 'cat.other'       as const },
] as const;

export const CONTACT_TYPES = [
  { id: 'wechat', i18nKey: 'contact.wechat' as const, placeholder: '微信号' },
  { id: 'phone',  i18nKey: 'contact.phone'  as const, placeholder: '+1 XXX-XXX-XXXX' },
  { id: 'email',  i18nKey: 'contact.email'  as const, placeholder: 'name@example.com' },
  { id: 'other',  i18nKey: 'contact.other'  as const, placeholder: '如：xxx#1234' },
] as const;

export type CategoryId   = typeof CATEGORIES[number]['id'];
export type ContactType  = typeof CONTACT_TYPES[number]['id'];
export type ItemType     = 'sell' | 'buy';

// 静态字典查询（不需要 React Hook 的场景）
function lookup(key: MessageKey, locale: Locale): string {
  return messages[key]?.[locale] ?? messages[key]?.zh ?? key;
}

// 把分类 id 转成本地化标签
export function categoryLabel(id: string, locale: Locale = 'zh'): string {
  const c = CATEGORIES.find(c => c.id === id);
  if (!c) return id;
  return lookup(c.i18nKey, locale);
}

// 把联系方式 type 转成本地化标签
export function contactTypeLabel(type: string, customLabel?: string | null, locale: Locale = 'zh'): string {
  if (type === 'other' && customLabel) return customLabel;
  const c = CONTACT_TYPES.find(c => c.id === type);
  if (!c) return type;
  return lookup(c.i18nKey, locale);
}

// 价格显示 — 出售贴 null = 面议；求购贴 null = 留言
export function formatPrice(
  price: number | null,
  locale: Locale = 'zh',
  itemType: ItemType = 'sell',
): string {
  if (price === null) {
    return lookup(itemType === 'buy' ? 'price.byMessage' : 'price.negotiable', locale);
  }
  return `$${price}`;
}

// 商品标题 + 价格（用于复制按钮）— 与界面语言无关，复制内容统一中文
export function itemCopyText(title: string, price: number | null, itemType: ItemType = 'sell'): string {
  const p = price === null
    ? (itemType === 'buy' ? messages['price.byMessage'].zh : messages['price.negotiable'].zh)
    : `$${price}`;
  return `${title} — ${p}`;
}

// 时间相对显示
export function timeAgo(date: Date | string, locale: Locale = 'zh'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60)            return lookup('time.justNow',   locale);
  if (seconds < 3600)          return lookup('time.minutesAgo',locale).replace('{n}', String(Math.floor(seconds / 60)));
  if (seconds < 86400)         return lookup('time.hoursAgo',  locale).replace('{n}', String(Math.floor(seconds / 3600)));
  if (seconds < 86400 * 30)    return lookup('time.daysAgo',   locale).replace('{n}', String(Math.floor(seconds / 86400)));
  if (seconds < 86400 * 365)   return lookup('time.monthsAgo', locale).replace('{n}', String(Math.floor(seconds / (86400 * 30))));
  return lookup('time.yearsAgo', locale).replace('{n}', String(Math.floor(seconds / (86400 * 365))));
}

// 解析 photoUrls JSON 字符串（SQLite 没数组类型，存的是 JSON）
export function parsePhotoUrls(s: string): string[] {
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// 序列化 photoUrls
export function serializePhotoUrls(urls: string[]): string {
  return JSON.stringify(urls);
}

// 从请求里取客户端 IP（用于限速）
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
