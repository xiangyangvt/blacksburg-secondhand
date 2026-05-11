'use client';

import { useState, useRef, useEffect } from 'react';

/** 自定义下拉框 — 替代原生 select，让风格和站点统一 */
export function Dropdown<T extends string>({
  options,
  value,
  onChange,
  className = '',
  placeholder = '',
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('touchstart', onDocPointer);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('touchstart', onDocPointer);
    };
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-1.5 border border-stone-300 rounded px-3 py-2 text-sm bg-white hover:border-brand active:bg-stone-50"
      >
        <span className="truncate">{selectedLabel}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          className={`text-stone-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-30 bg-white border border-stone-200 rounded-lg shadow-xl overflow-hidden min-w-max">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-100 active:bg-stone-200 whitespace-nowrap ${
                o.value === value
                  ? 'bg-brand/5 text-brand font-medium'
                  : 'text-stone-700'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
