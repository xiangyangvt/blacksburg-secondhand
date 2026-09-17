// POST /api/events/[id]/verify-code — Phase 3C
// 用于 EditCodePrompt 验证用户密码 → 通过后再打开 EventPostModal edit mode
// 跟二手 /api/items/[id]/verify-code 同款,避免发"假 PATCH"做验证

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getClientIp } from '@/lib/utils';
import { checkQuota } from '@/lib/rateLimit';

// Sprint 9A:编辑密码校验限流 —— 同 IP 10 次尝试 / 15 分钟。计所有尝试而非只计失败:
// 计数插入先于 bcrypt 比较(rateLimit 行只增不减),并发一批请求也不能超过 10 次比较(Codex 9A 互审)。
const VERIFY_WINDOW_MS = 15 * 60e3;
const VERIFY_MAX_ATTEMPTS = 10;
const verifyKey = (req: NextRequest) => `verify:ip:${getClientIp(req)}`;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, valid: false, error: 'Invalid JSON' }, { status: 400 }); }

  const code = typeof body.code === 'string' ? body.code : '';
  if (!params.id || !code) {
    return NextResponse.json({ ok: false, valid: false, error: '缺少参数' }, { status: 400 });
  }

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    select: { posterCodeHash: true, source: true },
  });
  if (!ev) {
    return NextResponse.json({ ok: false, valid: false, error: '活动不存在' }, { status: 404 });
  }
  if (!ev.posterCodeHash) {
    return NextResponse.json({ ok: false, valid: false, error: '该活动无密码,不可修改' }, { status: 403 });
  }

  if (!(await checkQuota({ key: verifyKey(req), windowMs: VERIFY_WINDOW_MS, max: VERIFY_MAX_ATTEMPTS })).ok) {
    return NextResponse.json({ ok: false, valid: false, error: '尝试次数过多,请 15 分钟后再试' }, { status: 429 });
  }
  const valid = await bcrypt.compare(code, ev.posterCodeHash);
  if (!valid) {
    return NextResponse.json({ ok: false, valid: false, error: '密码错误' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, valid: true });
}
