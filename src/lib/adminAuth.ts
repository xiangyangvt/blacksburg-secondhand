// 管理员身份验证 — cookie 模式
// 单管理员，密码就是 ADMIN_PASSWORD env var
// 登录后下发一个 httpOnly cookie，30 天过期

import { cookies } from 'next/headers';

const COOKIE_NAME = 'hb_admin';
const DEFAULT_PASS = 'changeme-in-production';

export function getAdminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  if (!p || p === DEFAULT_PASS) return null; // 拒绝默认密码登录
  return p;
}

export function isAdmin(): boolean {
  const expected = getAdminPassword();
  if (!expected) return false;
  const c = cookies().get(COOKIE_NAME)?.value;
  return c === expected;
}

export function setAdminCookie() {
  const expected = getAdminPassword();
  if (!expected) return;
  cookies().set(COOKIE_NAME, expected, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 天
  });
}

export function clearAdminCookie() {
  cookies().delete(COOKIE_NAME);
}
