// Sprint 7 Phase 1.6:抓取触发端点
// GitHub Actions cron 每天早上调用一次
// 也支持 manual dispatch(workflow_dispatch + curl)
//
// Auth:Bearer SCRAPER_SECRET(env)
// 行为:同步跑 runAllScrapers(SOURCES),返回各源结果
// 估时:11 源 × 平均 5-10s(LLM extract + 翻译) = 1-3 分钟

import { NextRequest, NextResponse } from 'next/server';
import { runAllScrapers, SOURCES } from '@/lib/scraper';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 分钟上限(Vercel hosts 有用,Railway 不强制)

export async function POST(req: NextRequest) {
  const secret = process.env.SCRAPER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'SCRAPER_SECRET 未配置,服务端拒绝运行' },
      { status: 500 },
    );
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const results = await runAllScrapers(SOURCES);
  const finishedAt = new Date().toISOString();

  return NextResponse.json({
    ok: true,
    startedAt,
    finishedAt,
    sources: results,
    summary: {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      failed:  results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      itemsNew: results.reduce((sum, r) => sum + r.itemsNew, 0),
    },
  });
}

// GET 仅用于 admin 手动验证 — 返回上次跑的 status 概览(不触发新一轮)
export async function GET(req: NextRequest) {
  const secret = process.env.SCRAPER_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'SCRAPER_SECRET 未配置' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 拉每个 source 最近 1 次 run
  const { prisma } = await import('@/lib/prisma');
  const lastRuns = await prisma.scrapeRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: SOURCES.length * 2,
  });
  // 按 source 取每个最新
  const bySource = new Map<string, typeof lastRuns[number]>();
  for (const r of lastRuns) {
    if (!bySource.has(r.source)) bySource.set(r.source, r);
  }

  return NextResponse.json({
    configured: SOURCES.map(s => ({ id: s.id, displayName: s.displayName, category: s.category, robotsAllowed: s.robotsAllowed })),
    lastRuns: Array.from(bySource.values()),
  });
}
