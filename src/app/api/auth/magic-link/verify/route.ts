// GET /api/auth/magic-link/verify?token=xxx[&redirect=/path]
//
// 流程:
// - 查 token,任一不通过(不存在 / usedAt 不为 null / 过期) → redirect /?login_error=invalid
// - 通过 → 生成 sessionToken,写 UserSession (30 天),标 token usedAt,Set-Cookie
// - redirect 到 ?redirect= 或 /(只允许 / 开头的相对路径,防 open redirect)

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const redirectParam = url.searchParams.get('redirect') ?? '/';

  // 只允许相对路径(单 / 开头,且不是 // 这种 protocol-relative URL)防 open redirect
  const safeRedirect = redirectParam.startsWith('/') && !redirectParam.startsWith('//')
    ? redirectParam
    : '/';

  const origin = url.origin;
  const failUrl = new URL('/?login_error=invalid', origin);

  if (!token) {
    return NextResponse.redirect(failUrl);
  }

  const row = await prisma.magicLinkToken.findUnique({ where: { token } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    return NextResponse.redirect(failUrl);
  }

  // 生成 session
  const sessionToken = crypto.randomBytes(16).toString('hex'); // 32 字符
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  await prisma.$transaction([
    prisma.userSession.create({
      data: {
        sessionToken,
        email: row.email,
        expiresAt,
      },
    }),
    prisma.magicLinkToken.update({
      where: { token },
      data: { usedAt: new Date() },
    }),
  ]);

  const res = NextResponse.redirect(new URL(safeRedirect, origin));
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return res;
}
