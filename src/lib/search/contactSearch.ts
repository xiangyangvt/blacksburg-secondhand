// Sprint 11F:搜索框按联系方式**精确**搜某位卖家(Sean 2026-09-18 拍板)
//
// 背景:9A 把关键词搜索里对 contactValue 的**子串**匹配去掉了——子串能逐字试出别人的联系方式(输 "a" 看谁命中,再输 "ab"……)。
// 这里只做**整串相等(忽略大小写)**:你得已经完整知道这个联系方式,才搜得到——这与线上早已存在的
// `GET /api/items/by-contact?value=`(物品卡「同卖家其他物品」)是同一个能力,没有新增暴露面。
//
// 约束:
//   - 命中后才过披露配额 gateReveal(tag = `by:<小写值>`;值本来就是小写时与 by-contact 同 tag,两条路只计一次);
//     没命中不碰配额,普通关键词搜索不受任何影响
//   - 配额拒绝 / bot → 当作没命中,退回普通关键词结果(响应与"没有这个卖家"无法区分,不构成探测口)
//   - 过了配额就进 11D 的异常侦测:拿一批号码挨个试的人,会在「不同目标数」上现形
//   - 响应里不回显联系方式(serializePublicItem 本来就不带)

const MIN_LEN = 3;
const MAX_LEN = 100;

/** 粗筛:长度合适、不含换行。真正的判定是数据库里的整串相等 */
export function contactCandidate(q: string | undefined | null): string | null {
  const s = q?.trim() ?? '';
  if (s.length < MIN_LEN || s.length > MAX_LEN || /[\r\n]/.test(s)) return null;
  return s;
}

export interface ContactSearchDb {
  /** Prisma 的 tagged-template $queryRaw:参数化,SQLite 与 Postgres 通用 */
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export interface SellerMatch {
  /** 一件锚点物品的 id(最近活跃的那件),给前端接「相似的」用 */
  anchorId: string;
  /** 库里与 q **忽略大小写后整串相等**的联系方式原值(可能不止一种写法)。只在服务端用,不下发 */
  variants: string[];
}

/** 配额 / 侦测用的 tag 归一成小写:同一位卖家不管怎么大小写,只计一次 */
export function contactTag(q: string): string {
  return `by:${q.toLowerCase()}`;
}

/**
 * 有在售物品的卖家里,是否有人的联系方式与 q 整串相等(**忽略大小写**,Sean 2026-09-18:`WX_Alice` 搜 `wx_alice` 要能搜到)。
 * 仍然是整串——前缀、子串一律不命中,逐字试不出别人的联系方式。
 *
 * 用 `lower(col) = lower(q)` 而不是 Prisma 的 `mode: 'insensitive'`:后者只有 Postgres 支持,dev 的 SQLite 客户端连类型都没有。
 * `lower()` 两边都有(SQLite 只折叠 ASCII,Postgres 折叠 Unicode;联系方式基本是 ASCII,差异可接受)。
 * 参数显式 `CAST(… AS TEXT)`:Postgres 里 `lower()` 既有 text 版也有 range 版,不标类型的绑定参数可能报「无法确定参数类型」;
 * 这个 CAST 两种数据库都认。
 * 走不了索引,是全表比较——几十到几千行的表上是毫秒级,而且只在搜索词通过粗筛后才跑。
 */
export async function findSellerMatch(q: string, db: ContactSearchDb): Promise<SellerMatch | null> {
  const rows = await db.$queryRaw<{ id: string; contactValue: string }[]>`
    SELECT "id", "contactValue" FROM "Item"
     WHERE lower("contactValue") = lower(CAST(${q} AS TEXT)) AND "status" = 'active' AND "category" <> 'housing'
     ORDER BY "bumpedAt" DESC
     LIMIT 200`;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  // 数据库的 lower() 与 JS 的 toLowerCase() 对非 ASCII 可能不一致:以 JS 这边再核一遍,宁可少命中
  const want = q.toLowerCase();
  const hit = rows.filter(r => typeof r.contactValue === 'string' && r.contactValue.toLowerCase() === want);
  if (hit.length === 0) return null;
  return { anchorId: hit[0]!.id, variants: [...new Set(hit.map(r => r.contactValue))] };
}
