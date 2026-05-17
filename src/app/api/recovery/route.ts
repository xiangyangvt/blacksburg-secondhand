// 密码找回回路 (Sprint 6 UX-5)
// POST /api/recovery — 用户提交找回申请
// GET  /api/recovery — admin 列表(需要 admin auth)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/utils';
import { isAdmin } from '@/lib/adminAuth';

// 反 spam 阈值
const PER_IP_24H_LIMIT = 3;
const PER_TARGET_24H_LIMIT = 5;
const ABUSE_DISTINCT_IPS = 3; // 同 targetId 3+ 不同 IP → 自动标 abuse

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const targetType = typeof body.targetType === 'string' ? body.targetType : '';
  const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : null;
  const targetContactValue = typeof body.targetContactValue === 'string' ? body.targetContactValue.trim() : '';
  const applicantWechat = typeof body.applicantWechat === 'string' ? body.applicantWechat.trim() : '';
  const applicantNote = typeof body.applicantNote === 'string' ? body.applicantNote.trim() || null : null;

  if (!['item', 'listing', 'event'].includes(targetType)) {
    return NextResponse.json({ error: 'targetType 必须是 item / listing / event' }, { status: 400 });
  }
  if (!applicantWechat) {
    return NextResponse.json({ error: '微信号不能为空' }, { status: 400 });
  }
  if (!targetContactValue && !targetId) {
    return NextResponse.json({ error: '需要联系方式或帖子 ID' }, { status: 400 });
  }

  const ip = getClientIp(req);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // 同 IP 24h 内 ≤ 3
  const ipCount = await prisma.recoveryRequest.count({
    where: { ipAddress: ip, createdAt: { gte: since } },
  });
  if (ipCount >= PER_IP_24H_LIMIT) {
    return NextResponse.json({ error: '你今日提交太多了,请明天再试' }, { status: 429 });
  }

  // 同 targetId 24h 内 ≤ 5
  if (targetId) {
    const targetCount = await prisma.recoveryRequest.count({
      where: { targetId, createdAt: { gte: since } },
    });
    if (targetCount >= PER_TARGET_24H_LIMIT) {
      return NextResponse.json({ error: '这条帖最近申请过多,请稍后再试' }, { status: 429 });
    }
  }

  // 3+ 不同 IP 申请同一 target → abuse 标记
  let initialStatus: 'pending' | 'abuse' = 'pending';
  if (targetId) {
    const distinctIps = await prisma.recoveryRequest.findMany({
      where: { targetId, createdAt: { gte: since } },
      select: { ipAddress: true },
      distinct: ['ipAddress'],
    });
    const uniqueCount = new Set(distinctIps.map(r => r.ipAddress).filter(Boolean)).size;
    if (uniqueCount + 1 >= ABUSE_DISTINCT_IPS) {
      initialStatus = 'abuse';
    }
  }

  const created = await prisma.recoveryRequest.create({
    data: {
      targetType,
      targetId,
      targetContactValue,
      applicantWechat,
      applicantNote,
      ipAddress: ip,
      status: initialStatus,
    },
  });

  return NextResponse.json({ id: created.id, status: created.status });
}

export async function GET(req: NextRequest) {
  if (!isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const validStatus = ['pending', 'contacted', 'resolved', 'rejected', 'abuse', 'all'];
  if (!validStatus.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const items = await prisma.recoveryRequest.findMany({
    where: status === 'all' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ items });
}
