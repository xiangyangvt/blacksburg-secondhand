// Sprint 11A:卖家摊位 —— slug ↔ 联系方式
//
// 扫长图二维码进站 = 完成一次「按卖家搜索」(Sean 2026-09-18)。slug 是这次搜索的不透明参数:
//   - 个人信息不进 URL(9A 既有规矩:URL 会留在日志、浏览记录、转发链路里);短码也让二维码更稀疏好扫
//   - 同一卖家永远同一个 slug,摊位实时查询,旧长图不过期
// 已有的 `sameSellerAs=<itemId>`(9A,物品卡「同卖家其他物品」)继续保留:那条路以某件物品为锚,锚点售出即失效,
// 适合站内临时跳转,不适合贴在群里几周的长图。

import { randomBytes } from 'crypto';

/** 去掉易混字符(0/o、1/l/i)的小写字母数字表:slug 偶尔会被人念出来或手抄 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const SHELF_SLUG_LEN = 8;
export const SHELF_SLUG_RE = /^[a-z0-9]{6,16}$/;

export function newShelfSlug(bytes: (n: number) => Uint8Array = randomBytes): string {
  const b = bytes(SHELF_SLUG_LEN);
  let s = '';
  for (let i = 0; i < SHELF_SLUG_LEN; i++) s += ALPHABET[b[i]! % ALPHABET.length];
  return s;
}

export function parseShelfSlug(raw: string | null | undefined): string | undefined {
  const s = raw?.trim().toLowerCase();
  return s && SHELF_SLUG_RE.test(s) ? s : undefined;
}

export interface ShelfDb {
  shelf: {
    findUnique(args: { where: { slug: string } | { contactValue: string }; select: { slug: true; contactValue: true } }): Promise<{ slug: string; contactValue: string } | null>;
    create(args: { data: { slug: string; contactValue: string }; select: { slug: true; contactValue: true } }): Promise<{ slug: string; contactValue: string }>;
  };
}

/** slug → 联系方式。null = 摊位不存在(列表应返空,同 resolveSellerContact 的约定) */
export async function resolveShelfContact(slug: string, db: ShelfDb): Promise<string | null> {
  const row = await db.shelf.findUnique({ where: { slug }, select: { slug: true, contactValue: true } });
  return row?.contactValue ?? null;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/**
 * 取或建这位卖家的摊位。调用方必须**先验过身份**(联系方式 + 编辑码)。
 * 并发双建 / slug 撞车都落在唯一约束上:撞了就重读或换一个 slug 再试。
 */
export async function getOrCreateShelf(contactValue: string, db: ShelfDb, slugFn: () => string = newShelfSlug): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.shelf.findUnique({ where: { contactValue }, select: { slug: true, contactValue: true } });
    if (existing) return existing.slug;
    try {
      const row = await db.shelf.create({ data: { slug: slugFn(), contactValue }, select: { slug: true, contactValue: true } });
      return row.slug;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new Error('shelf: 连续 5 次唯一约束冲突');
}
