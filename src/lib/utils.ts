// 通用工具函数 — 部分函数接受 locale 参数支持中英切换

import type { Locale, MessageKey } from '@/i18n/messages';
import { messages } from '@/i18n/messages';

// ===== 室友&转租平台常量 =====

/** 室友 listing 4 种类型 */
export const LISTING_TYPES = [
  { id: 'find_roommate', i18nKey: 'listing.type.find_roommate' as const, label: '找室友',     intent: 'home_owner' },     // A
  { id: 'co_rent',       i18nKey: 'listing.type.co_rent'       as const, label: '合租伙伴',   intent: 'team_up' },        // B
  { id: 'sublet',        i18nKey: 'listing.type.sublet'        as const, label: '转租',       intent: 'lease_transfer' }, // C
  { id: 'summer',        i18nKey: 'listing.type.summer'        as const, label: '暑期短租',   intent: 'short_term' },     // D
] as const;
export type ListingTypeId = typeof LISTING_TYPES[number]['id'];

/** 黑堡常见居住区域（chips 多选） */
export const LISTING_AREAS = [
  'Downtown',
  'Foxridge',
  'Hethwood',
  'Oak Lane',
  'Toms Creek',
  'University City',
  '其他',
] as const;

/** 性别选项 */
export const LISTING_GENDERS = ['F', 'M', 'nb', 'unspecified'] as const;
export type ListingGender = typeof LISTING_GENDERS[number];

/** 找谁 = 是否接受跨性别 */
export const LISTING_LOOKING_FOR = ['F-only', 'M-only', 'any'] as const;
export type ListingLookingFor = typeof LISTING_LOOKING_FOR[number];

/** 年龄档（5 岁档） */
export const LISTING_AGE_RANGES = ['<22', '22-25', '25-30', '30+'] as const;

/** 7 个生活方式维度 + 选项 */
export const LIFESTYLE_DIMS = {
  sleepSchedule: ['early', 'late', 'flexible'],
  cleanliness:   ['neat', 'average', 'casual'],
  social:        ['quiet', 'occasional', 'frequent'],
  smoking:       ['no', 'ok', 'yes'],
  drinking:      ['no', 'occasional', 'frequent'],
  pets:          ['none', 'cat', 'dog', 'other'],
  guests:        ['no', 'occasional', 'ok'],
} as const;

export const CATEGORIES = [
  { id: 'home',        i18nKey: 'cat.home'        as const },
  { id: 'electronics', i18nKey: 'cat.electronics' as const },
  { id: 'transport',   i18nKey: 'cat.transport'   as const },
  { id: 'books',       i18nKey: 'cat.books'       as const },
  { id: 'housing',     i18nKey: 'cat.housing'     as const },
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

// 价格显示 —— 出售贴 null = 面议；求购贴 null = 留言；房屋类自动加 /月
export function formatPrice(
  price: number | null,
  locale: Locale = 'zh',
  itemType: ItemType = 'sell',
  category?: string,
): string {
  if (price === null) {
    return lookup(itemType === 'buy' ? 'price.byMessage' : 'price.negotiable', locale);
  }
  const suffix = category === 'housing' ? lookup('price.perMonth', locale) : '';
  return `$${price}${suffix}`;
}

// 房屋分类下，"出售/求购"显示为"转租/求租"——更准确
export function typeLabel(itemType: ItemType, category: string, locale: Locale = 'zh'): string {
  if (category === 'housing') {
    return lookup(itemType === 'buy' ? 'type.rentwanted' : 'type.sublet', locale);
  }
  return lookup(itemType === 'buy' ? 'type.buy' : 'type.sell', locale);
}

// 商品标题 + 价格（用于复制按钮）—— 与界面语言无关，复制内容统一中文
export function itemCopyText(
  title: string,
  price: number | null,
  itemType: ItemType = 'sell',
  category?: string,
): string {
  let p: string;
  if (price === null) {
    p = itemType === 'buy' ? messages['price.byMessage'].zh : messages['price.negotiable'].zh;
  } else {
    p = `$${price}${category === 'housing' ? messages['price.perMonth'].zh : ''}`;
  }
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

// ===== 设计系统：类目色 + 新鲜度 =====

// 类目对应的纯色（用于小圆点）。这里所有类名都是字面字符串，
// 确保 Tailwind JIT 在 build 时能扫到（动态拼接的 className 会被丢）
const CAT_DOT_CLASS: Record<string, string> = {
  home:        'bg-cat-home',
  electronics: 'bg-cat-electronics',
  transport:   'bg-cat-transport',
  books:       'bg-cat-books',
  housing:     'bg-cat-housing',
  other:       'bg-cat-other',
};

// 类目对应的浅色背景（10% 透明度），用于 chip 底色微微染色
const CAT_BG_CLASS: Record<string, string> = {
  home:        'bg-cat-home/10',
  electronics: 'bg-cat-electronics/10',
  transport:   'bg-cat-transport/10',
  books:       'bg-cat-books/10',
  housing:     'bg-cat-housing/10',
  other:       'bg-cat-other/10',
};

/** 类目色小圆点的 Tailwind class（fallback 灰色） */
export function categoryDotClass(category: string): string {
  return CAT_DOT_CLASS[category] ?? 'bg-stone-400';
}

/** 类目背景 chip 的浅色 tint class */
export function categoryBgClass(category: string): string {
  return CAT_BG_CLASS[category] ?? 'bg-stone-100';
}

/**
 * 新鲜度可视化：根据 bumpedAt（最近活跃时间）返回 label + Tailwind class
 *   < 24h    → 绿色"刚刚发布"
 *   < 7 天   → 中性灰
 *   < 30 天  → 浅灰
 *   > 30 天  → 极浅灰 + 斜体（视觉降权但不删）
 */
export function freshnessBadge(
  date: Date | string,
  locale: Locale = 'zh',
): { label: string; className: string; isFresh: boolean } {
  const d = typeof date === 'string' ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  const hours = ms / 3.6e6;
  const days = hours / 24;

  if (hours < 24) {
    return {
      label: lookup('time.fresh', locale),
      className: 'text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium',
      isFresh: true,
    };
  }
  if (days < 7) {
    return { label: timeAgo(d, locale), className: 'text-stone-500', isFresh: false };
  }
  if (days < 30) {
    return { label: timeAgo(d, locale), className: 'text-stone-400', isFresh: false };
  }
  return { label: timeAgo(d, locale), className: 'text-stone-300 italic', isFresh: false };
}
