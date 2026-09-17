// POST /api/events/[id]/verify-code — Phase 3C
// 用于 EditCodePrompt 验证用户密码 → 通过后再打开 EventPostModal edit mode
// 跟二手 /api/items/[id]/verify-code 同款,避免发"假 PATCH"做验证

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getClientIp } from '@/lib/utils';
import { checkQuota, peekQuota } from '@/lib/rateLimit';

// Sprint 9A:编辑密码校验失败限流 —— 同 IP 10 次 / 15 分钟(只记失败)
const VERIFY_WINDOW_MS = 15 * 60e3;
const VERIFY_MAX_FAILS = 10;
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

  if (!(await peekQuota({ key: verifyKey(req), windowMs: VERIFY_WINDOW_MS, max: VERIFY_MAX_FAILS }))) {
    return NextResponse.json({ ok: false, valid: false, error: '尝试次数过多,请 15 分钟后再试' }, { status: 429 });
  }
  const valid = await bcrypt.compare(code, ev.posterCodeHash);
  if (!valid) {
    await checkQuota({ key: verifyKey(req), windowMs: VERIFY_WINDOW_MS, max: VERIFY_MAX_FAILS });
    return NextResponse.json({ ok: false, valid: false, error: '密码错误' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, valid: true });
}
