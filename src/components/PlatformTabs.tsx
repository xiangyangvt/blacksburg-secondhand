'use client';

// 平台切换 tab(Sprint 6.5 改造):[二手] [室友&转租] 平铺,替代之前的 ▾ dropdown
// 设计依据:
//   - Pre-attentive processing —— 可见 tab < 200ms 被识别;dropdown 需要 fixate + decode
//   - Hick's Law —— 2 个可见选项的决策成本 < 1 隐藏选项 + 探索 ▾
//   - Active 视觉:brand 浅底 + brand 深字(跟 filter chip 一致,不跟「+发布」抢红)
//   - 图标避开 🏠 emoji 俗气感:二手 = Package(中性箱子),室友 = Users(多人)
//
// 用法:两个主页 header 都放 <PlatformTabs />,内部 usePathname 自动识别 active

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, Users } from 'lucide-react';

const TABS = [
  { href: '/',          label: '二手',       labelShort: '二手', icon: Package },
  { href: '/roommates', label: '室友&转租',  labelShort: '室友', icon: Users },
] as const;

export function PlatformTabs() {
  const pathname = usePathname() || '/';

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {TABS.map(tab => {
        const Icon = tab.icon;
        // active 判定:/ 精确匹配,其它前缀匹配
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
            <Icon size={13} strokeWidth={2.2} className="flex-shrink-0" />
            {/* 窄屏只显示短标签,宽屏显示完整 */}
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.labelShort}</span>
          </Link>
        );
      })}
    </div>
  );
}
