// Sprint 10B:混合检索接口
//
// GET /api/search?site=items&q=...&(筛选参数同 /api/items)&semantic=1
// 响应 { keyword: [...], semantic: [...], aiEnabled, trigger: 'auto' | 'button', limited }
//   keyword  与 GET /api/items 同一套 where / orderBy / 序列化(共用 lib/itemsQuery.ts),顺序逐条一致
//   semantic 仅 aiEnabled 时算:查询词 embed(10 分钟缓存)→ 在"同样过滤条件但不带关键词"的候选内取最近邻
//            → 去掉 keyword 已有的 id → 低于阈值丢弃 → 最多 10 条,不含关键词层已有的 id
//   trigger  keyword < 5 条为 auto;否则 button
//   semantic 参数:'0' = 只要关键词层与 trigger(客户端先渲染第 0 层,再单独请求语义层,embedding 故障不拖住关键词);
//            '1' = 强制算语义层(按钮触发 / 客户端的第二段请求);不传 = 按 trigger 自动(给直接调 API 的人)
// 降级:SEARCH_AI_ENABLED=false / 无 key → aiEnabled=false、semantic=[];AI 侧任何错误 → semantic=[],keyword 照常。
// 限流:只砍语义路。同 visitor 60 次 / 小时;bot UA 直接只返回 keyword。
//      自动触发被限 → 200 + limited=true;按钮触发(semantic=1)被限 → 429,但 body 里 keyword 照常返回。
// 响应字段白名单与 /api/items 一致(不含联系方式 / IP / hash / 向量)。
// v1 只做 site=items;/roommates 与 /localnews 在 10B-2 复用。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setVisitorCookie } from '@/lib/rateLimit';
import {
  parseItemsQuery, buildItemsWhere, itemsOrderBy, resolveSellerContact, serializePublicItem, ITEM_LIST_INCLUDE,
} from '@/lib/itemsQuery';
import { getVectorStore } from '@/lib/search/vectorStore';
import {
  isSearchAiEnabled, semanticMinSim, getQueryEmbeddingCache, pickSemantic, semanticTrigger, gateSemanticSearch,
} from '@/lib/search/hybrid';

export const dynamic = 'force-dynamic';

/** 语义候选上限:先按同样条件筛出 id,再在其中排序(先过滤后排序) */
const CANDIDATE_CAP = 2000;
const NEAREST_K = 20;
const SEMANTIC_MAX = 10;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get('site') !== 'items') {
    return NextResponse.json({ error: 'site 仅支持 items(室友 / 活动站在 10B-2)' }, { status: 400 });
  }
  const qy = parseItemsQuery(sp);
  if (!qy.q) return NextResponse.json({ error: '缺少 q;无关键词请用列表接口' }, { status: 400 });

  // ===== 第 0 层:关键词,与 /api/items 完全一致 =====
  const sellerContact = await resolveSellerContact(qy.sameSellerAs, prisma);
  const aiEnabled = isSearchAiEnabled();
  if (sellerContact === null) {
    return NextResponse.json({ keyword: [], semantic: [], aiEnabled, trigger: 'auto', limited: false });
  }
  const whereOpts = sellerContact !== undefined ? { sellerContact } : {};
  const keywordRows = await prisma.item.findMany({
    where: buildItemsWhere(qy, { ...whereOpts, includeKeyword: true }),
    orderBy: itemsOrderBy(qy.sort),
    take: 200,
    include: ITEM_LIST_INCLUDE,
  });
  const keyword = keywordRows.map(serializePublicItem);
  const trigger = semanticTrigger(keyword.length);
  const mode = sp.get('semantic'); // '0' | '1' | null
  const explicit = mode === '1';
  const wantSemantic = aiEnabled && mode !== '0' && (trigger === 'auto' || explicit);

  let semantic: any[] = [];
  let limited = false;
  let status = 200;
  let cookie: { visitorId: string } | null = null;

  if (wantSemantic) {
    // 配额检查也在降级边界内:配额表读写失败只是没有语义层,不能让关键词层一起 500(互审 #1)
    try {
      const gate = await gateSemanticSearch(req);
      if (!gate.ok) {
        if (gate.reason === 'limited') {
          limited = true;
          if (gate.isNew && gate.visitorId) cookie = { visitorId: gate.visitorId };
          if (explicit) status = 429;
        }
        // bot:静默只返回 keyword
      } else {
        if (gate.isNew) cookie = { visitorId: gate.visitorId };
        const vector = await getQueryEmbeddingCache().get(qy.q);
        const candidates = await prisma.item.findMany({
          where: buildItemsWhere(qy, { ...whereOpts, includeKeyword: false }),
          select: { id: true },
          take: CANDIDATE_CAP,
        });
        const hits = await getVectorStore().nearest('item', vector, { ids: candidates.map(c => c.id) }, NEAREST_K);
        const picked = pickSemantic(hits, keyword.map(k => k.id), semanticMinSim(), SEMANTIC_MAX);
        if (picked.length > 0) {
          const rows = await prisma.item.findMany({
            where: { id: { in: picked.map(p => p.id) }, status: 'active' },
            include: ITEM_LIST_INCLUDE,
          });
          const byId = new Map(rows.map(r => [r.id, r]));
          semantic = picked
            .filter(p => byId.has(p.id))
            .map(p => ({ ...serializePublicItem(byId.get(p.id)), similarity: Math.round(p.similarity * 1000) / 1000 }));
        }
      }
    } catch (e) {
      // AI 侧任何错误(配额表、embedding、向量存储)都降级为"没有补充结果",不影响第 0 层
      console.warn('[search] semantic 路失败,降级:', (e as Error)?.message ?? e);
      semantic = [];
    }
  }

  const res = NextResponse.json({ keyword, semantic, aiEnabled, trigger, limited }, { status });
  if (cookie) setVisitorCookie(res, cookie.visitorId);
  return res;
}
