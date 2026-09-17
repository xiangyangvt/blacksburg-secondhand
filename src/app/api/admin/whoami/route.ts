// GET /api/admin/whoami — 管理员调试:服务端算出的客户端 IP 与原始代理头(Sprint 9E)
// 用途:上线后核对 Railway 的 X-Forwarded-For 是"追加"还是"透传"(DEPLOY.md「管理员会话密钥」)。
// 需要管理员会话 cookie;不暴露给未登录请求。

import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/adminAuth';
import { getClientIp } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({
    ip: getClientIp(req),
    xForwardedFor: req.headers.get('x-forwarded-for'),
    xRealIp: req.headers.get('x-real-ip'),
  });
}
