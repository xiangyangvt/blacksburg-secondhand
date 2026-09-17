// POST /api/pageview  —— 客户端 PageViewBeacon 在 pathname 变化时调用
// body: { path: string, referer?: string, utmSource?: string }
//
// 服务端 cookie 'hb_vid'（1 年）：首次没有就生成 randomUUID 写入；后续读出来当 visitorId
// 不存 IP（隐私 + 避免反复变化）；存 path + referer + utm + 简短 UA + visitorId
//
// 这是 admin 后台访客统计的数据源；Plausible 等 SaaS 替代但数据要发外网，自建更轻

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVisitorId, isBotUA, setVisitorCookie } from '@/lib/rateLimit';


export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const path = typeof body.path === 'string' ? body.path.slice(0, 500) : '/';
  const referer = typeof body.referer === 'string' ? body.referer.slice(0, 500) : null;
  const utmSource = typeof body.utmSource === 'string' ? body.utmSource.slice(0, 64) : null;
  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 200);

  // 排除明显是 bot 的请求（粗略匹配 — 不严密但能滤掉绝大多数爬虫）
  if (isBotUA(userAgent, 'full')) {
    return NextResponse.json({ ok: true, skipped: 'bot' });
  }

  // 1 年 cookie 跟踪 visitor
  const { visitorId, isNew } = getVisitorId(req);

  try {
    await prisma.pageView.create({
      data: { visitorId, path, utmSource, referer, userAgent },
    });
  } catch {
    // 失败也别让客户端感知
  }

  const res = NextResponse.json({ ok: true });
  if (isNew) setVisitorCookie(res, visitorId);
  return res;
}
