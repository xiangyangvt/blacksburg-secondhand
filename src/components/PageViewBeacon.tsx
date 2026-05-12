'use client';

// 客户端访问埋点 —— 挂在 root layout 里
// pathname 变化时 fire-and-forget POST /api/pageview
// 服务端写 PageView 行 + 用 cookie 跟 visitorId（详见 /api/pageview/route.ts）

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function PageViewBeacon() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    // 避免严格模式下的重复发送 + 路由切换防抖
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    // 跳过 admin 自己的访问（admin 的请求不算"用户浏览"）
    if (pathname?.startsWith('/admin')) return;

    let utmSource: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      utmSource = params.get('utm_source')
        || sessionStorage.getItem('hb_utm_source')
        || null;
    } catch {}

    const referer = typeof document !== 'undefined' ? document.referrer || null : null;

    fetch('/api/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname, referer, utmSource }),
      keepalive: true,  // 允许在卸载页面后还能发完
    }).catch(() => { /* 静默失败 */ });
  }, [pathname]);

  return null;
}
