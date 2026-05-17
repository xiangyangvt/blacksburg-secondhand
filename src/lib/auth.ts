// Session 工具 —— 读 hb_session cookie + 查 UserSession 表
//
// server-only:用 next/headers.cookies(),不要在 client component import。

import { cookies } from 'next/headers';
import { prisma } from './prisma';

export const SESSION_COOKIE = 'hb_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 天(秒)

export type Session = {
  email: string;
  nickname: string | null;
  contactValue: string | null;
  contactType: string | null;
};

/** 读当前请求的 session。无 cookie / 找不到 / 过期 → null。过期会顺手删行。 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await prisma.userSession.findUnique({
    where: { sessionToken: token },
  });
  if (!row) return null;

  if (row.expiresAt.getTime() < Date.now()) {
    // 过期 —— 清理并视为未登录
    try {
      await prisma.userSession.delete({ where: { sessionToken: token } });
    } catch {
      // 删除失败不影响判断
    }
    return null;
  }

  return {
    email: row.email,
    nickname: row.nickname,
    contactValue: row.contactValue,
    contactType: row.contactType,
  };
}

/** 删 session —— 清 cookie + 删 UserSession 行 */
export async function deleteSession(): Promise<void> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await prisma.userSession.delete({ where: { sessionToken: token } });
    } catch {
      // 行已不存在,忽略
    }
  }
  cookieStore.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
}
