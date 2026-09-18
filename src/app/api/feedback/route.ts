// Sprint 11E:POST /api/feedback   body { message, contact?, source, page? }
//
// 用户反馈 / 问站长。不依赖 AI 开关:SEARCH_AI_ENABLED=false、预算熔断时照常可用。
// 配额:同 visitor 5 条 / 小时、15 条 / 天;同 IP 20 条 / 小时。bot UA 403。
// 响应不回显内容;contact 只在 /admin 显示。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setVisitorCookie } from '@/lib/rateLimit';
import { gateFeedback, sanitizeFeedback, FEEDBACK_LIMIT_MESSAGE } from '@/lib/feedback';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const input = sanitizeFeedback(body);
  if (!input) return NextResponse.json({ error: '请写下你遇到的问题' }, { status: 400 });

  const gate = await gateFeedback(req);
  if (!gate.ok) {
    if (gate.reason === 'bot') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const res = NextResponse.json(
      { error: FEEDBACK_LIMIT_MESSAGE.zh, message: FEEDBACK_LIMIT_MESSAGE, retryAfterSec: gate.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
    if (gate.isNew && gate.visitorId) setVisitorCookie(res, gate.visitorId);
    return res;
  }

  await prisma.feedback.create({ data: { ...input, ipAddress: gate.ip } });
  const res = NextResponse.json({ ok: true });
  if (gate.isNew) setVisitorCookie(res, gate.visitorId);
  return res;
}
