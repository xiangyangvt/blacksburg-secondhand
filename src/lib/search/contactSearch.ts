// Sprint 11F:搜索框按联系方式**精确**搜某位卖家(Sean 2026-09-18 拍板)
//
// 背景:9A 把关键词搜索里对 contactValue 的**子串**匹配去掉了——子串能逐字试出别人的联系方式(输 "a" 看谁命中,再输 "ab"……)。
// 这里只做**整串相等**:你得已经完整知道这个联系方式,才搜得到——这与线上早已存在的
// `GET /api/items/by-contact?value=`(物品卡「同卖家其他物品」)是同一个能力,没有新增暴露面。
//
// 约束:
//   - 命中后才过披露配额 gateReveal(tag = `by:<值>`,与 by-contact 同一个 tag → 同一位卖家两条路只计一次);
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
  item: {
    findFirst(args: { where: { contactValue: string; status: 'active'; NOT: { category: 'housing' } }; select: { id: true }; orderBy: { bumpedAt: 'desc' } }): Promise<{ id: string } | null>;
  };
}

/** 有在售物品的卖家里,是否有人的联系方式与 q 整串相等。返回一件锚点物品的 id(给前端接「相似的」用),没有返回 null */
export async function findSellerAnchor(q: string, db: ContactSearchDb): Promise<string | null> {
  const row = await db.item.findFirst({
    where: { contactValue: q, status: 'active', NOT: { category: 'housing' } },
    select: { id: true },
    orderBy: { bumpedAt: 'desc' },
  });
  return row?.id ?? null;
}
