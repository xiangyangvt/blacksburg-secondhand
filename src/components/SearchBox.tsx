'use client';

// 搜索框(Sprint 6.6 调整):始终展开,桌面 / 移动同款,只是宽度不同
// 之前的 icon-collapse 模式被 Sean 砍了 —— 移动也不挤,直接展开更直接

import { Search } from 'lucide-react';

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  // Sprint 7.2 跨页面对齐:Sean 反馈 mobile 上 / 跟 /roommates 搜索框宽度差异
  // 即使两个页面 header 结构代码一模一样,flex-1 在动态 layout 中可能因为相邻
  // 元素 mount/measure 时机不同导致最终像素宽不一致(Chrome / Safari 都有这种情况)
  // 治根:mobile 端也加硬性 max-width,sm+ 用固定 w —— 两个页面都强制 cap 到同一像素宽
  return (
    <div className="flex-1 min-w-0 max-w-[160px] sm:max-w-none sm:flex-none sm:w-[220px] relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-stone-100 border border-transparent rounded-chip pl-9 pr-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-stone-300 transition-colors"
      />
    </div>
  );
}
