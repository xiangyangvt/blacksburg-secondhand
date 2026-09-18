// Sprint 11B:GET /api/items/similar?shelf=<slug> | sameSellerAs=<itemId>   →  { items, mode }
//
// 「和这位卖家的东西相似的」—— 以卖家在售物品**已存的向量**为引子(10A),在其余在售物品里逐件找近邻。
//   - **不调大模型、不调 embedding 接口**:只是数据库查询,零费用,不占 AI 搜索配额,也不受 SEARCH_AI_ENABLED 影响
//   - 按件分别查,不取平均:卖家的东西通常很杂(沙发 + 显示器),平均向量什么都不像
//   - 合并:每件候选取它对各引子的最高相似度,过阈值(同语义层的 SEARCH_SEMANTIC_MIN_SIM),降序取前 LIMIT
//   - 向量不可用 / 一条都没过阈值 → 兜底「同类目最新」(mode = 'category')
// 响应与 /api/items 同款脱敏卡片。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseItemsQuery, resolveSeller, serializePublicItem, ITEM_LIST_INCLUDE } from '@/lib/itemsQuery';
import { getVectorStore } from '@/lib/search/vectorStore';
import { semanticMinSim } from '@/lib/search/hybrid';
import { mergeSimilar } from '@/lib/search/similar';

export const dynamic = 'force-dynamic';

const LIMIT = 12;
const K_PER_SOURCE = 6;
const CANDIDATE_CAP = 2000;

export async function GET(req: NextRequest) {
  const qy = parseItemsQuery(req.nextUrl.searchParams);
  const contact = await resolveSeller(qy, prisma);
  if (!contact) return NextResponse.json({ items: [], mode: 'none' });

  const base = { status: 'active', NOT: { category: 'housing' } } as const;
  const [mine, others] = await Promise.all([
    prisma.item.findMany({ where: { ...base, contactValue: contact }, select: { id: true, category: true }, orderBy: { bumpedAt: 'desc' }, take: 200 }),
    prisma.item.findMany({ where: { ...base, contactValue: { not: contact } }, select: { id: true }, take: CANDIDATE_CAP }),
  ]);
  if (mine.length === 0 || others.length === 0) return NextResponse.json({ items: [], mode: 'none' });

  let ids: string[] = [];
  let mode: 'vector' | 'category' = 'vector';
  try {
    const hits = await getVectorStore().nearestToRows('item', mine.map(m => m.id), { ids: others.map(o => o.id) }, K_PER_SOURCE);
    ids = mergeSimilar(hits, semanticMinSim(), LIMIT);
  } catch (e) {
    console.warn('[items/similar] 向量查询失败,走同类目兜底:', (e as Error)?.message ?? e);
  }

  if (ids.length === 0) {
    mode = 'category';
    const cats = Array.from(new Set(mine.map(m => m.category)));
    const rows = await prisma.item.findMany({
      where: { ...base, contactValue: { not: contact }, category: { in: cats } },
      select: { id: true }, orderBy: { bumpedAt: 'desc' }, take: LIMIT,
    });
    ids = rows.map(r => r.id);
  }
  if (ids.length === 0) return NextResponse.json({ items: [], mode: 'none' });

  const rows = await prisma.item.findMany({ where: { id: { in: ids }, status: 'active' }, include: ITEM_LIST_INCLUDE });
  const byId = new Map(rows.map(r => [r.id, r]));
  return NextResponse.json({ items: ids.filter(id => byId.has(id)).map(id => serializePublicItem(byId.get(id))), mode });
}
