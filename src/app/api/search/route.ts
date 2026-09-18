// Sprint 10B / 10B-2:混合检索接口(三个站点共用)
//
// GET /api/search?site=items|listings|events&q=...&(筛选参数同各站列表接口)&semantic=0|1
// 响应 { keyword: [...], semantic: [...], aiEnabled, trigger: 'auto' | 'button', limited, chatEnabled }
//   keyword  items / listings:与各自列表 GET 同一套 where / orderBy / 序列化(共用 lib/*Query.ts),顺序逐条一致
//            events:活动站的关键词搜索是**客户端过滤**(列表 ≤ 100 条一次取回),这里恒为 [];客户端用 kw=<本地命中数> 告诉服务端
//   semantic 仅 aiEnabled 时算:查询词 embed(10 分钟缓存)→ 在"同样过滤条件但不带关键词"的候选内取最近邻
//            → 去掉 keyword 已有的 id(events 由客户端按本地命中再去重)→ 低于阈值丢弃 → 最多 10 条
//   trigger  关键词命中 < 5 条为 auto;否则 button
//   semantic 参数:'0' = 只要关键词层与 trigger(客户端先渲染第 0 层,再单独请求语义层,embedding 故障不拖住关键词);
//            '1' = 强制算语义层(按钮触发 / 客户端的第二段请求);不传 = 按 trigger 自动(给直接调 API 的人)
//   exclude  可选,逗号分隔的 id(≤ 300):关键词层在客户端的页面把"已展示的 id"传来,服务端**先排除再取前 10**,
//            否则前 10 条可能全是已展示的、真正的新结果被截掉
//   chatEnabled 第 2 层(10C)v1 只在 items 提供
// 降级:SEARCH_AI_ENABLED=false / 无 key → aiEnabled=false、semantic=[];AI 侧任何错误 → semantic=[],keyword 照常。
// 限流:只砍语义路。同 visitor 60 次 / 小时 + 同 IP 300 次 / 小时;bot UA 直接只返回 keyword。
//      自动触发被限 → 200 + limited=true;按钮触发(semantic=1)被限 → 429,但 body 里 keyword 照常返回。
// 响应字段白名单与各站列表接口一致(不含联系方式 / IP / hash / 向量)。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setVisitorCookie } from '@/lib/rateLimit';
import {
  parseItemsQuery, buildItemsWhere, itemsOrderBy, resolveSellerContact, serializePublicItem, ITEM_LIST_INCLUDE,
} from '@/lib/itemsQuery';
import {
  parseListingsQuery, buildListingsWhere, listingsOrderBy, filterListingsByAreas, serializePublicListing, LISTING_LIST_INCLUDE,
} from '@/lib/listingsQuery';
import { buildEventsWhere, isRetiredCategory, serializePublicEvent } from '@/lib/eventsQuery';
import { expireStaleEvents } from '@/lib/eventArchive';
import { getVectorStore } from '@/lib/search/vectorStore';
import type { EmbedKind } from '@/lib/search/embedText';
import {
  isSearchAiEnabled, semanticMinSim, getQueryEmbeddingCache, pickSemantic, semanticTrigger, gateSemanticSearch,
} from '@/lib/search/hybrid';
import { isBudgetExceeded } from '@/lib/llmUsage';

export const dynamic = 'force-dynamic';

/** 语义候选上限:先按同样条件筛出 id,再在其中排序(先过滤后排序) */
const CANDIDATE_CAP = 2000;
const NEAREST_K = 20;
const SEMANTIC_MAX = 10;

/** 每个站点提供三件事;语义层的其余逻辑(配额 / embed / 最近邻 / 去重 / 阈值 / 降级)共用 */
interface SiteHandler {
  kind: EmbedKind;
  q: string;
  /** 第 0 层。null = 查询条件本身无结果(如同卖家锚点已下架、退役类目),整个响应返空 */
  keyword(): Promise<any[] | null>;
  /** 第 0 层命中数(决定 trigger)。events 由客户端经 kw 传入 */
  keywordCount(keyword: any[]): number;
  /** 同样过滤条件但不带关键词的候选 id */
  candidateIds(): Promise<string[]>;
  /** 按 id 取公开卡片(与该站列表接口同款脱敏) */
  fetchPublic(ids: string[]): Promise<Map<string, any>>;
  /** 是否提供第 2 层对话(v1 只有 items) */
  chat: boolean;
}

type HandlerResult = SiteHandler | { error: string };

async function itemsHandler(sp: URLSearchParams): Promise<HandlerResult> {
  const qy = parseItemsQuery(sp);
  if (!qy.q) return { error: '缺少 q;无关键词请用列表接口' };
  const q = qy.q;
  const sellerContact = await resolveSellerContact(qy.sameSellerAs, prisma);
  const whereOpts = sellerContact != null ? { sellerContact } : {};
  return {
    kind: 'item', q, chat: true,
    async keyword() {
      if (sellerContact === null) return null;
      const rows = await prisma.item.findMany({
        where: buildItemsWhere(qy, { ...whereOpts, includeKeyword: true }),
        orderBy: itemsOrderBy(qy.sort), take: 200, include: ITEM_LIST_INCLUDE,
      });
      return rows.map(serializePublicItem);
    },
    keywordCount: (k) => k.length,
    async candidateIds() {
      const rows = await prisma.item.findMany({ where: buildItemsWhere(qy, { ...whereOpts, includeKeyword: false }), select: { id: true }, take: CANDIDATE_CAP });
      return rows.map(r => r.id);
    },
    async fetchPublic(ids) {
      const rows = await prisma.item.findMany({ where: { id: { in: ids }, status: 'active' }, include: ITEM_LIST_INCLUDE });
      return new Map(rows.map(r => [r.id, serializePublicItem(r)]));
    },
  };
}

async function listingsHandler(sp: URLSearchParams): Promise<HandlerResult> {
  const qy = parseListingsQuery(sp);
  if (!qy.q) return { error: '缺少 q;无关键词请用列表接口' };
  const q = qy.q;
  // 室友页的搜索框是客户端过滤:页面带 kw=<本地命中数> 来,服务端就不重复算关键词层(去重由客户端按已展示 id 做)。
  // 不带 kw(直接调 API)时仍返回与列表接口一致的服务端关键词层。
  const clientKw = sp.has('kw') ? Math.max(0, Math.min(1000, parseInt(sp.get('kw') ?? '0', 10) || 0)) : null;
  return {
    kind: 'listing', q, chat: false,
    async keyword() {
      if (clientKw !== null) return [];
      const rows = await prisma.listing.findMany({ where: buildListingsWhere(qy), orderBy: listingsOrderBy(qy.sort), take: 200, include: LISTING_LIST_INCLUDE });
      return filterListingsByAreas(rows, qy.areas).map(serializePublicListing);
    },
    keywordCount: (k) => clientKw ?? k.length,
    async candidateIds() {
      const rows = await prisma.listing.findMany({ where: buildListingsWhere(qy, { includeKeyword: false }), select: { id: true, areas: true }, take: CANDIDATE_CAP });
      return filterListingsByAreas(rows, qy.areas).map(r => r.id);
    },
    async fetchPublic(ids) {
      const rows = await prisma.listing.findMany({ where: { id: { in: ids }, status: 'active' }, include: LISTING_LIST_INCLUDE });
      return new Map(rows.map(r => [r.id, serializePublicListing(r)]));
    },
  };
}

async function eventsHandler(sp: URLSearchParams): Promise<HandlerResult> {
  const q = sp.get('q')?.trim();
  if (!q) return { error: '缺少 q' };
  const category = sp.get('category');
  const kw = Math.max(0, Math.min(1000, parseInt(sp.get('kw') ?? '0', 10) || 0));
  return {
    kind: 'event', q, chat: false,
    async keyword() {
      if (isRetiredCategory(category)) return null;
      // 与列表接口一样,查询前先跑一次 lazy 归档(内部节流 5 分钟):否则 where 里"无 endAt 且 24h 内开始"的宽条件
      // 会放出按 4 小时规则本该已过期、只是还没人访问列表触发归档的活动(Codex 互审 #2)
      await expireStaleEvents();
      return [];
    },
    keywordCount: () => kw,
    async candidateIds() {
      const rows = await prisma.event.findMany({ where: buildEventsWhere(category), select: { id: true }, take: CANDIDATE_CAP });
      return rows.map(r => r.id);
    },
    async fetchPublic(ids) {
      // 取卡片时再套一次列表的过滤条件:候选之后才过期 / 被隐藏的活动不会漏出来
      const [rows, responses] = await Promise.all([
        prisma.event.findMany({ where: { AND: [buildEventsWhere(category), { id: { in: ids } }] } }),
        prisma.eventContactSend.groupBy({ by: ['eventId'], where: { eventId: { in: ids }, status: { not: 'canceled' } }, _count: { id: true } }),
      ]);
      const counts = new Map(responses.map(r => [r.eventId, r._count.id]));
      return new Map(rows.map(r => [r.id, serializePublicEvent(r, counts.get(r.id) ?? 0)]));
    },
  };
}

const HANDLERS: Record<string, (sp: URLSearchParams) => Promise<HandlerResult>> = {
  items: itemsHandler, listings: listingsHandler, events: eventsHandler,
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const make = HANDLERS[sp.get('site') ?? ''];
  if (!make) return NextResponse.json({ error: 'site 必须是 items / listings / events' }, { status: 400 });
  const h = await make(sp);
  if ('error' in h) return NextResponse.json({ error: h.error }, { status: 400 });

  const aiEnabled = isSearchAiEnabled();

  // ===== 第 0 层:关键词,与各站列表接口完全一致 =====
  const keyword = await h.keyword();
  if (keyword === null) {
    return NextResponse.json({ keyword: [], semantic: [], aiEnabled, trigger: 'auto', limited: false, chatEnabled: false });
  }
  const trigger = semanticTrigger(h.keywordCount(keyword));
  const mode = sp.get('semantic'); // '0' | '1' | null
  const explicit = mode === '1';
  const wantSemantic = aiEnabled && mode !== '0' && (trigger === 'auto' || explicit);

  const exclude = (sp.get('exclude') ?? '').split(',').map(s => s.trim()).filter(s => /^[A-Za-z0-9_-]{1,40}$/.test(s)).slice(0, 300);

  let semantic: any[] = [];
  let limited = false;
  let status = 200;
  let cookie: { visitorId: string } | null = null;

  if (wantSemantic) {
    // 配额检查也在降级边界内:配额表读写失败只是没有语义层,不能让关键词层一起 500
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
        const vector = await getQueryEmbeddingCache().get(h.q);
        // 被排除的 id 会占掉最近邻名额,所以多取这么多条,排除后仍有机会凑满 10 条
        const hits = await getVectorStore().nearest(h.kind, vector, { ids: await h.candidateIds() }, NEAREST_K + exclude.length);
        const picked = pickSemantic(hits, [...keyword.map(k => k.id), ...exclude], semanticMinSim(), SEMANTIC_MAX);
        if (picked.length > 0) {
          const byId = await h.fetchPublic(picked.map(p => p.id));
          semantic = picked
            .filter(p => byId.has(p.id))
            .map(p => ({ ...byId.get(p.id), similarity: Math.round(p.similarity * 1000) / 1000 }));
        }
      }
    } catch (e) {
      // AI 侧任何错误(配额表、embedding、向量存储)都降级为"没有补充结果",不影响第 0 层
      console.warn('[search] semantic 路失败,降级:', (e as Error)?.message ?? e);
      semantic = [];
    }
  }

  // 10C:第 2 层是否可用 = 该站点提供对话 且 AI 开 且 当日预算未熔断(熔断时 UI 直接不出输入框;第 1 层不受影响)
  const chatEnabled = h.chat && aiEnabled && !(await isBudgetExceeded());

  const res = NextResponse.json({ keyword, semantic, aiEnabled, trigger, limited, chatEnabled }, { status });
  if (cookie) setVisitorCookie(res, cookie.visitorId);
  return res;
}
