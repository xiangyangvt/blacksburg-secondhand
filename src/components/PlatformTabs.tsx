'use client';

// 平台切换 tab：[二手] [室友&转租]
// 放在两个主页头部都用，靠 usePathname 自动高亮当前平台

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/',          label: '二手',       },
  { href: '/roommates', label: '室友&转租',  },
] as const;

export function PlatformTabs() {
  const pathname = usePathname() || '/';

  return (
    <div className="flex items-center gap-1 -mx-1">
      {TABS.map(tab => {
        // 当前 tab：精确匹配 / 或前缀匹配 /roommates
        const active = tab.href === '/'
          ? pathname === '/'
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-1.5 rounded-chip text-sm font-medium whitespace-nowrap transition-colors ${
              active
                ? 'bg-stone-900 text-white shadow-card'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
