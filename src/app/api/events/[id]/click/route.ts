// POST /api/events/[id]/click  — 卡片被点击/展开时调用,event.clickCount + 1
//
// 防刷:同 visitor 5 分钟内对同一 event 只算一次(EventClickThrottle 表 + cookie)
// visitorId 复用 hb_vid cookie(跟 pageview 同一份),所以 cross-session 不会被刷
// bot 过滤同 pageview UA 黑名单
//
// Phase 2A: clickCount 用于计算 hot score,前端按梯度显示 🔥 icon

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVisitorId, isBotUA, setVisitorCookie } from '@/lib/rateLimit';

const THROTTLE_MIN = 5;                  // 5 分钟内同 visitor 同 event 不重复计数

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const eventId = params.id;
  if (!eventId) return NextResponse.json({ ok: false }, { status: 400 });

  // bot 过滤 — 跟 pageview 同款
  if (isBotUA(req, 'full')) {
    return NextResponse.json({ ok: true, skipped: 'bot' });
  }

  const { visitorId, isNew } = getVisitorId(req);
  const cutoff = new Date(Date.now() - THROTTLE_MIN * 60 * 1000);

  try {
    // 看最近是否计过
    const recent = await prisma.eventClickThrottle.findUnique({
      where: { eventId_visitorId: { eventId, visitorId } },
    });
    if (recent && recent.createdAt > cutoff) {
      // 5 分钟内已计过 - 不重复 increment(但仍返回 ok,client 不感知)
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { clickCount: true },
      });
      const res = NextResponse.json({ ok: true, throttled: true, clickCount: event?.clickCount ?? 0 });
      if (isNew) setVisitorCookie(res, visitorId);
      return res;
    }

    // upsert throttle 记录(更新 createdAt 滚动 5 分钟窗口)
    await prisma.eventClickThrottle.upsert({
      where: { eventId_visitorId: { eventId, visitorId } },
      create: { eventId, visitorId },
      update: { createdAt: new Date() },
    });

    // event clickCount + 1(同时校验 event 存在 — 不存在会抛)
    const event = await prisma.event.update({
      where: { id: eventId },
      data: { clickCount: { increment: 1 } },
      select: { clickCount: true },
    });

    const res = NextResponse.json({ ok: true, counted: true, clickCount: event.clickCount });
    if (isNew) setVisitorCookie(res, visitorId);
    return res;
  } catch (e) {
    // event 不存在 / DB 故障 — 静默,client 不感知
    return NextResponse.json({ ok: false }, { status: 404 });
  }
}

