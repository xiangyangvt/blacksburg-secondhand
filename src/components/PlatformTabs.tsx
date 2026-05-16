'use client';

// 平台切换 tab(Sprint 7 起 3 tab):[黑堡] [二手] [室友&转租]
//   - 黑堡 = 本地信息流 hub(/localnews),自绘双山峰 icon
//   - 二手 = /(原默认)
//   - 室友&转租 = /roommates
//
// 设计依据:
//   - 三个 tab 视觉对等(同 size / 同 font / icon + 文字),用户脑里 mental model 统一
//   - active 用 brand 浅底 + brand 字(跟 filter chip 一致)
//   - 黑堡 icon 自绘双山峰 — Blacksburg 字面 "Black + burg",山地小镇,地理锚点

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, Users } from 'lucide-react';

function MountainIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden
    >
      {/* 双山峰 silhouette */}
      <path d="M3 19 L9 10 L13 15 L17 8 L21 19" />
    </svg>
  );
}

const TABS = [
  { href: '/localnews',  label: '黑堡',       labelShort: '黑堡', icon: 'mountain' as const },
  { href: '/',           label: '二手',       labelShort: '二手', icon: 'package'  as const },
  { href: '/roommates',  label: '室友&转租',  labelShort: '室友', icon: 'users'    as const },
] as const;

export function PlatformTabs() {
  const pathname = usePathname() || '/';

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {TABS.map(tab => {
        // active 判定:精确 / 才匹配 /,/localnews 和 /roommates 用前缀
        const active = tab.href === '/'
          ? pathname === '/'
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch
            aria-current={active ? 'page' : undefined}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-chip text-sm font-medium whitespace-nowrap transition-colors ${
              active
                ? 'bg-brand/10 text-brand'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            {tab.icon === 'mountain' ? <MountainIcon /> :
             tab.icon === 'package'  ? <Package size={13} strokeWidth={2.2} className="flex-shrink-0" /> :
                                        <Users   size={13} strokeWidth={2.2} className="flex-shrink-0" />}
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.labelShort}</span>
          </Link>
        );
      })}
    </div>
  );
}
