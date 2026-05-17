// GET /api/auth/me —— 返当前 session(或 null)
// 客户端用来判断登录态、拿邮箱/联系方式预填

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ session });
}
