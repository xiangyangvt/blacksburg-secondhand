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
  // Mobile: flex-1(填充剩余空间);sm+(>= 640px): 显式固定 220px 像素宽
  // 用显式宽度避免 flex-1 + max-w 的双重不确定性导致跨页面宽度感知差异
  return (
    <div className="flex-1 min-w-0 sm:flex-none sm:w-[220px] relative">
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
