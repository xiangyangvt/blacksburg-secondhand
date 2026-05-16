// Sprint 7 Phase 1.7+:events 公开列表 API
// 给 /localnews 页面 fetch 用
//
// 排序逻辑(Sean 反馈,Phase 1.9):
// - 活动/体育 用 startAt(活动时间);新闻/讨论 用 publishedAt(发布时间)
// - 统一按"距离现在多久"排序 — 绝对时间差越小越靠前
// - 这样混合 view 也合理:"3 小时后的活动" 跟 "3 小时前的帖子" 都贴近"现在"

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type EventRow = {
  category: string | null;
  startAt: Date | null;
  publishedAt: Date | null;
  scrapedAt: Date;
};

/** 每个 event 取它"语义上"的时间锚点(news/discussion 用发布时间,events/sports 用活动时间) */
function relevanceTime(e: EventRow): number {
  if (e.category === 'news' || e.category === 'discussion') {
    return (e.publishedAt ?? e.scrapedAt).getTime();
  }
  return (e.startAt ?? e.publishedAt ?? e.scrapedAt).getTime();
}

// GET /api/events?category=events|sports|news|discussion&limit=50
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const category = sp.get('category');
  const limitRaw = sp.get('limit');
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 100) : 50;

  // 过滤:仅 active + qualityScore ≥ 0.5 + 未过期(过期 = endAt 已过 OR 没 endAt 但 startAt 早于 1 天前)
  // 新闻/讨论没有 startAt/endAt — 走 startAt:null 分支保留下来,后续靠 publishedAt 排序
  const oneDayAgo = new Date(Date.now() - 86400000);

  const where: any = {
    status: 'active',
    qualityScore: { gte: 0.5 },
    OR: [
      { endAt: { gte: new Date() } },
      { endAt: null, startAt: { gte: oneDayAgo } },
      { startAt: null }, // 没 startAt 的(news/discussion)— 由 publishedAt 排序
    ],
  };
  if (category) where.category = category;

  // 拉够多让排序后还有富余 — DB 层不做精确 sort,因为 sort 字段是按 row 计算的
  const candidates = await prisma.event.findMany({
    where,
    // 先按 scrapedAt 降序拉,保证最近爬到的优先入候选;再在内存里按 relevance 排
    orderBy: { scrapedAt: 'desc' },
    take: Math.min(limit * 3, 300),
  });

  const now = Date.now();
  const sorted = candidates
    .map(e => ({ row: e, score: Math.abs(relevanceTime(e as any) - now) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(x => x.row);

  return NextResponse.json({ events: sorted });
}
