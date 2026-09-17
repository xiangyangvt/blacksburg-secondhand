// POST /api/listings/[id]/verify-code
// 纯校验端点：body { editCode } → { valid: boolean }
// 用途：编辑流程在打开编辑表单前先验证密码，避免"错码也能进编辑界面"的体感 bug
//
// 设计：限速放宽（5 次/IP/分钟即可，正常流程一次就过），失败时返回 401 但不泄漏额外信息

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/utils';
import { checkQuota } from '@/lib/rateLimit';

// Sprint 9A:编辑密码校验限流 —— 同 IP 10 次尝试 / 15 分钟。计所有尝试而非只计失败:
// 计数插入先于 bcrypt 比较(rateLimit 行只增不减),并发一批请求也不能超过 10 次比较(Codex 9A 互审)。
const VERIFY_WINDOW_MS = 15 * 60e3;
const VERIFY_MAX_ATTEMPTS = 10;
const verifyKey = (req: NextRequest) => `verify:ip:${getClientIp(req)}`;

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ valid: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { editCode } = body;
  if (typeof editCode !== 'string' || !editCode) {
    return NextResponse.json({ valid: false, error: '请输入密码' }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || (listing.status !== 'active' && listing.status !== 'draft')) {
    return NextResponse.json({ valid: false, error: 'listing 不存在' }, { status: 404 });
  }

  if (!(await checkQuota({ key: verifyKey(req), windowMs: VERIFY_WINDOW_MS, max: VERIFY_MAX_ATTEMPTS })).ok) {
    return NextResponse.json({ valid: false, error: '尝试次数过多,请 15 分钟后再试' }, { status: 429 });
  }
  const ok = await bcrypt.compare(editCode, listing.editCodeHash);
  if (!ok) {
    return NextResponse.json({ valid: false, error: '密码错误' }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
