// Sprint 11C:一键长图 —— 取数与版式数据(纯函数,不碰渲染)
//
// 长图 = 卖家全部在售物品的确定性排版:照片、标题、价格、关键信息**原样取自帖子**,不经 AI 改写(Sean 2026-09-18)。
// 图上不印链接(图片是像素,微信里点不开),唯一的跳转通道是底部二维码 → /s/<slug>。
// 图里只有公开信息:不含联系方式(要联系卖家 → 扫码进站走带配额的披露流程,9A)。

import { CATEGORIES } from './utils';
import { messages } from '@/i18n/messages';

/** 每张图最多几件。超长图在微信里会被压糊;这个数要真机发群里看效果再调(spec 待定项) */
export const POSTER_PAGE_SIZE = 10;
export const POSTER_WIDTH = 1080;
/** 宽度单位:一个全角字 = 1,半角字符 ≈ 0.55。标题一行、描述摘要两行(按 1080 宽、右栏约 680px 算) */
export const TITLE_MAX = 16;
export const INFO_MAX = 44;

export interface PosterSourceItem {
  id: string;
  type: string;
  title: string;
  description: string;
  price: number | null;
  category: string;
  customTag: string | null;
  photoUrls: string; // JSON 数组
}

export interface PosterRow {
  id: string;
  typeLabel: '出售' | '求购';
  title: string;
  priceText: string;
  tag: string;
  info: string;
  photo: string | null;
}

const unitOf = (ch: string) => (ch.codePointAt(0)! > 0x2e7f ? 1 : 0.55);

/** 按**显示宽度**截断(全角 1、半角 0.55;按码点走,不切坏 emoji / 代理对),超出加省略号 */
export function clip(text: string, maxUnits: number): string {
  const cp = [...text.replace(/\s+/g, ' ').trim()];
  let w = 0;
  for (let i = 0; i < cp.length; i++) {
    w += unitOf(cp[i]!);
    if (w > maxUnits) return `${cp.slice(0, Math.max(0, i - 1)).join('')}…`;
  }
  return cp.join('');
}

/**
 * Cloudinary 原图 → 正方形小图。satori 只认 png / jpg(不认 webp / avif),所以强制 f_jpg。
 * **只认 Cloudinary**:photoUrls 是发帖人提交的字符串,入库时没有限定域名;长图接口会在服务端去取这张图,
 * 任意 URL 都取就是 SSRF。非 Cloudinary 的一律当无图(返回 null)。
 */
export function posterPhotoUrl(url: string, size = 360): string | null {
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/)([A-Za-z0-9_\-./,:]+)$/);
  if (!m || m[2]!.includes('..')) return null;
  return `${m[1]}c_fill,g_auto,w_${size},h_${size},q_auto:good,f_jpg/${m[2]}`;
}

function firstPhoto(photoUrls: string): string | null {
  try {
    const arr = JSON.parse(photoUrls);
    if (!Array.isArray(arr)) return null;
    for (const x of arr) {
      const u = typeof x === 'string' ? posterPhotoUrl(x) : null;
      if (u) return u;
    }
    return null;
  } catch { return null; }
}

export function toPosterRow(it: PosterSourceItem): PosterRow {
  const buy = it.type === 'buy';
  const cat = CATEGORIES.find(c => c.id === it.category);
  const catLabel = cat ? messages[cat.i18nKey].zh : '';
  return {
    id: it.id,
    typeLabel: buy ? '求购' : '出售',
    title: clip(it.title, TITLE_MAX),
    priceText: it.price === null ? (buy ? messages['price.byMessage'].zh : messages['price.negotiable'].zh) : `$${it.price}`,
    tag: clip(it.customTag?.trim() || catLabel, 8),
    info: clip(it.description ?? '', INFO_MAX),
    photo: firstPhoto(it.photoUrls),
  };
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / POSTER_PAGE_SIZE));
}

/** 第 page 页(1 起)的切片;越界页钳到合法范围 */
export function pageSlice<T>(rows: readonly T[], page: number): { page: number; pages: number; rows: T[] } {
  const pages = pageCount(rows.length);
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { page: p, pages, rows: rows.slice((p - 1) * POSTER_PAGE_SIZE, p * POSTER_PAGE_SIZE) };
}

/** 图上会出现的全部字符(去重)。拿去向 Google Fonts 要一份只含这些字形的子集字体 */
export function glyphSet(texts: readonly string[]): string {
  return [...new Set([...texts.join('')])].filter(ch => ch > ' ').sort().join('');
}

export const ROW_HEIGHT = 320;
export const HEADER_HEIGHT = 230;
export const FOOTER_HEIGHT = 440;

export function posterHeight(rowCount: number): number {
  return HEADER_HEIGHT + Math.max(1, rowCount) * ROW_HEIGHT + FOOTER_HEIGHT;
}
