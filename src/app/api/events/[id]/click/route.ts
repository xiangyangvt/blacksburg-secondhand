// POST /api/events/[id]/click  — 卡片被点击/展开时调用,event.clickCount + 1
//
// 防刷:同 visitor 5 分钟内对同一 event 只算一次(EventClickThrottle 表 + cookie)
// visitorId 复用 hb_vid cookie(跟 pageview 同一份),所以 cross-session 不会被刷
// bot 过滤同 pageview UA 黑名单
//
// Phase 2A: clickCount 用于计算 hot score,前端按梯度显示 🔥 icon

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

const VID_COOKIE = 'hb_vid';
const VID_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const THROTTLE_MIN = 5;                  // 5 分钟内同 visitor 同 event 不重复计数

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const eventId = params.id;
  if (!eventId) return NextResponse.json({ ok: false }, { status: 400 });

  // bot 过滤 — 跟 pageview 同款
  const ua = (req.headers.get('user-agent') ?? '').toLowerCase();
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider') || ua.includes('preview') || ua.includes('headless')) {
    return NextResponse.json({ ok: true, skipped: 'bot' });
  }

  const existing = req.cookies.get(VID_COOKIE)?.value;
  const visitorId = existing || randomUUID();
  const cutoff = new Date(Date.now() - THROTTLE_MIN * 60 * 1000);

  try {
    // 看最近是否计过
    const recent = await prisma.eventClickThrottle.findUnique({
      where: { eventId_visitorId: { eventId, visitorId } },
    });
    if (recent && recent.createdAt > cutoff) {
      // 5 分钟内已计过 - 不重复 increment(但仍返回 ok,client 不感知)
      const res = NextResponse.json({ ok: true, throttled: true });
      if (!existing) setVisitorCookie(res, visitorId);
      return res;
    }

    // upsert throttle 记录(更新 createdAt 滚动 5 分钟窗口)
    await prisma.eventClickThrottle.upsert({
      where: { eventId_visitorId: { eventId, visitorId } },
      create: { eventId, visitorId },
      update: { createdAt: new Date() },
    });

    // event clickCount + 1(同时校验 event 存在 — 不存在会抛)
    await prisma.event.update({
      where: { id: eventId },
      data: { clickCount: { increment: 1 } },
    });
  } catch (e) {
    // event 不存在 / DB 故障 — 静默,client 不感知
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true });
  if (!existing) setVisitorCookie(res, visitorId);
  return res;
}

function setVisitorCookie(res: NextResponse, visitorId: string) {
  res.cookies.set(VID_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: VID_MAX_AGE,
    path: '/',
  });
}
