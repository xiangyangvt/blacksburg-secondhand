import { NextResponse, type NextRequest } from 'next/server';
import { stripTrailingJunk } from '@/lib/cleanPath';

// 只做一件事:链接末尾粘了标点的请求,308 到干净路径(query 原样保留)。
export function middleware(req: NextRequest) {
  const cleaned = stripTrailingJunk(req.nextUrl.pathname);
  if (!cleaned) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = cleaned;
  return NextResponse.redirect(url, 308);
}

export const config = {
  // 静态资源、API、带扩展名的文件不经过
  matcher: ['/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)'],
};
