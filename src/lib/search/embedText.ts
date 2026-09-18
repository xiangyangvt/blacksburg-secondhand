// Sprint 10A:embedding 文本构造(纯函数)
//
// 不变量(ARCHITECTURE.md §8.11):送入 embedding / LLM 的文本永远不含
//   contactValue、customContactLabel、posterContact、ipAddress、email、任何 hash / token / visitorId。
// 做法:显式白名单取字段,绝不 spread。输入类型只声明允许的字段;读库时用下面的 *_EMBED_SELECT,
// 让"多取一个字段"在 TypeScript 层就报错,而不是靠人记。

import { messages } from '@/i18n/messages';
import { LISTING_TYPES, LISTING_MOVEIN_FUZZY } from '@/lib/utils';

export type EmbedKind = 'item' | 'listing' | 'event';
export const EMBED_KINDS: readonly EmbedKind[] = ['item', 'listing', 'event'];

/** 描述截断长度:text-embedding-3-small 上下文 8k token,1500 字符对中英文都留足余量 */
export const MAX_DESC_CHARS = 1500;

// ---------- 读库白名单(indexer / backfill 用) ----------

export const ITEM_EMBED_SELECT = {
  id: true, title: true, description: true, price: true, category: true, customTag: true, type: true,
} as const;

export const LISTING_EMBED_SELECT = {
  id: true, title: true, description: true, type: true, areas: true, budgetMin: true, budgetMax: true,
  hasPlace: true, housingLayout: true, furnished: true, moveInFuzzy: true,
} as const;

export const EVENT_EMBED_SELECT = {
  id: true, title: true, titleOriginal: true, description: true, location: true, category: true,
  customCategory: true, startAt: true,
} as const;

// ---------- 输入类型(与 SELECT 一一对应) ----------

export interface ItemEmbedInput {
  title: string;
  description: string | null;
  price: number | null;
  category: string;
  customTag: string | null;
  type: string; // sell | buy
}

export interface ListingEmbedInput {
  title: string;
  description: string | null;
  type: string; // find_roommate | co_rent | sublet | summer
  areas: string; // JSON 数组字符串
  budgetMin: number | null;
  budgetMax: number | null;
  hasPlace: boolean;
  housingLayout: string | null;
  furnished: boolean | null;
  moveInFuzzy: string | null;
}

export interface EventEmbedInput {
  title: string;
  titleOriginal: string | null;
  description: string | null;
  location: string | null;
  category: string | null;
  customCategory: string | null;
  startAt: Date | null;
}

// ---------- 标签表 ----------

type Bilingual = { zh: string; en: string };

function categoryLabel(category: string): Bilingual | null {
  const m = (messages as Record<string, Bilingual | undefined>)[`cat.${category}`];
  return m ?? null;
}

const LISTING_TYPE_EN: Record<string, string> = {
  find_roommate: 'looking for roommate',
  co_rent: 'co-rent partner',
  sublet: 'sublet',
  summer: 'summer short-term rental',
};

const EVENT_CATEGORY: Record<string, Bilingual> = {
  life:        { zh: '生活',   en: 'life' },
  exercise:    { zh: '运动',   en: 'exercise' },
  academic:    { zh: '学术',   en: 'academic' },
  competition: { zh: '比赛',   en: 'competition' },
  other:       { zh: '其他',   en: 'other' },
};

// ---------- 小工具 ----------

function clip(s: string | null | undefined, max = MAX_DESC_CHARS): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) : t;
}

function parseAreas(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function priceWords(price: number | null): string {
  if (price === null) return '价格面议 · price negotiable';
  const tier = price <= 20 ? '便宜 cheap' : price <= 100 ? '中等价位 mid-price' : '较贵 pricey';
  return `$${price} · ${tier}`;
}

function budgetWords(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `预算 $${min}-$${max}/月 · budget $${min}-$${max}/month`;
  if (min !== null) return `预算 $${min}+/月 · budget from $${min}/month`;
  return `预算 $${max} 以内/月 · budget up to $${max}/month`;
}

function isoDate(d: Date | null): string | null {
  if (!d || isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function join(parts: (string | null | undefined)[]): string {
  return parts.map(p => (p ?? '').trim()).filter(Boolean).join('\n');
}

// ---------- 三种帖子 ----------

export function itemEmbedText(i: ItemEmbedInput): string {
  const cat = categoryLabel(i.category);
  return join([
    clip(i.title, 200),
    i.type === 'buy' ? '求购 · wanted to buy' : '出售 · for sale',
    cat ? `类目 ${cat.zh} · category ${cat.en}` : `类目 ${i.category}`,
    i.customTag ? `标签 ${clip(i.customTag, 60)}` : null,
    priceWords(i.price),
    clip(i.description),
  ]);
}

export function listingEmbedText(l: ListingEmbedInput): string {
  const typeDef = LISTING_TYPES.find(t => t.id === l.type);
  const areas = parseAreas(l.areas);
  const moveIn = LISTING_MOVEIN_FUZZY.find(m => m.v === l.moveInFuzzy);
  return join([
    clip(l.title, 200),
    typeDef ? `${typeDef.label} · ${LISTING_TYPE_EN[l.type] ?? l.type}` : l.type,
    l.hasPlace ? '有房找室友 · has a place' : '找地方合住 · looking for a place',
    areas.length ? `区域 ${areas.join(' / ')} · area ${areas.join(' / ')}` : null,
    budgetWords(l.budgetMin, l.budgetMax),
    l.housingLayout ? `户型 ${clip(l.housingLayout, 40)}` : null,
    l.furnished === true ? '带家具 · furnished' : l.furnished === false ? '不带家具 · unfurnished' : null,
    moveIn ? `入住 ${moveIn.l}` : null,
    clip(l.description),
  ]);
}

export function eventEmbedText(e: EventEmbedInput): string {
  const cat = e.category ? EVENT_CATEGORY[e.category] : undefined;
  const catText = e.category === 'other' && e.customCategory
    ? `类别 ${clip(e.customCategory, 40)}`
    : cat ? `类别 ${cat.zh} · category ${cat.en}` : null;
  const date = isoDate(e.startAt);
  return join([
    clip(e.title, 200),
    e.titleOriginal && e.titleOriginal !== e.title ? clip(e.titleOriginal, 200) : null,
    catText,
    e.location ? `地点 ${clip(e.location, 120)}` : null,
    date ? `时间 ${date}` : null,
    clip(e.description),
  ]);
}

export type EmbedInputOf<K extends EmbedKind> =
  K extends 'item' ? ItemEmbedInput : K extends 'listing' ? ListingEmbedInput : EventEmbedInput;

export function embedTextFor<K extends EmbedKind>(kind: K, row: EmbedInputOf<K>): string {
  switch (kind) {
    case 'item':    return itemEmbedText(row as ItemEmbedInput);
    case 'listing': return listingEmbedText(row as ListingEmbedInput);
    default:        return eventEmbedText(row as EventEmbedInput);
  }
}
