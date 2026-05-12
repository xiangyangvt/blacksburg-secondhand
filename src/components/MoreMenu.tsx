'use client';

// 小型动作菜单：⋯ 按钮 → 弹出 popover，里面是若干操作项
// 用于 ItemCard 的卖家操作（编辑/删除/举报）折叠，让买家视图更干净

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';

export type MoreMenuItem = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  /** 红色危险样式（如"删除"） */
  danger?: boolean;
};

export function MoreMenu({ items, className = '' }: { items: MoreMenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="p-1.5 rounded-full text-stone-500 hover:text-stone-900 hover:bg-stone-100 active:bg-stone-200 transition-colors"
        aria-label="更多操作"
        aria-expanded={open}
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 min-w-[140px] bg-white border border-stone-200 rounded-lg shadow-overlay overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                it.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
