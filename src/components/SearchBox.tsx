'use client';

// 响应式搜索框(Sprint 6.5):桌面常驻输入框(窄),移动 icon 触发展开
// 心理学依据:
//   - 桌面:零摩擦,placeholder 本身是 information scent
//   - 移动:header 空间紧,collapsing 节省视觉负担,代价是多 1 次点击
//   - 没数据时这是赌注,Sprint 7 数据基建上来后用 click_count 验证

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  // 移动端展开状态。如果初始 value 非空(URL ?q= 进来的)→ 直接展开
  const [mobileOpen, setMobileOpen] = useState(() => Boolean(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // 展开后自动 focus
  useEffect(() => {
    if (mobileOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [mobileOpen]);

  return (
    <>
      {/* ===== 桌面 ===== */}
      <div className="hidden md:flex flex-1 min-w-0 max-w-[260px] relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-stone-100 border border-transparent rounded-chip pl-9 pr-3 py-2 text-sm focus:outline-none focus:bg-white focus:border-stone-300 transition-colors"
        />
      </div>

      {/* ===== 移动 ===== */}
      <div className="md:hidden flex-shrink-0">
        {mobileOpen ? (
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            <input
              ref={inputRef}
              value={value}
              onChange={e => onChange(e.target.value)}
              onBlur={() => { if (!value.trim()) setMobileOpen(false); }}
              placeholder="搜索"
              className="w-32 bg-stone-100 border border-transparent rounded-chip pl-8 pr-7 py-2 text-sm focus:outline-none focus:bg-white focus:border-stone-300 transition-colors"
            />
            <button
              type="button"
              onClick={() => { onChange(''); setMobileOpen(false); }}
              aria-label="关闭搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-0.5"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="搜索"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <Search size={18} />
          </button>
        )}
      </div>
    </>
  );
}
