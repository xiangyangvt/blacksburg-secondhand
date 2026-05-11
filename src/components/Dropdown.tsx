'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * 自定义下拉框 — 替代原生 select，风格与站点统一。
 *
 * 关键设计：popup 通过 React Portal 渲染到 document.body，
 * 这样能逃离任何祖先的 overflow:hidden / overflow:auto 截断
 * （之前手机端 MobileFilterToggle 的 max-h 滚动容器会把下拉菜单"挡住"）。
 *
 * 同时根据按钮在视口里的位置自动选择"往上开"或"往下开"：
 * 下方空间不够（< 估算菜单高）就翻上面。
 */
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    btnTop: number;
    btnBottom: number;
    left: number;
    width: number;
    direction: 'down' | 'up';
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const computePosition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // 估算菜单高度：每条 ~36px + padding，5 条以内约 200px
    const ESTIMATED = Math.min(options.length * 38 + 8, 240);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const direction: 'down' | 'up' =
      (spaceBelow < ESTIMATED && spaceAbove > spaceBelow) ? 'up' : 'down';
    setPos({
      btnTop: rect.top,
      btnBottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      direction,
    });
  }, [options.length]);

  const handleToggle = () => {
    if (!open) {
      computePosition();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  // 关闭逻辑：点外部、滚动（含内部容器）、resize 都关
  useEffect(() => {
    if (!open) return;

    const onDocPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onClose = () => setOpen(false);

    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('touchstart', onDocPointer);
    // capture 抓所有滚动（包括内部 overflow:auto 容器的滚动）
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);

    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('touchstart', onDocPointer);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;

  // Portal 菜单的 fixed 定位
  let menuStyle: React.CSSProperties = {};
  if (pos && typeof window !== 'undefined') {
    if (pos.direction === 'down') {
      menuStyle = {
        position: 'fixed',
        top: pos.btnBottom + 4,
        left: pos.left,
        minWidth: pos.width,
      };
    } else {
      menuStyle = {
        position: 'fixed',
        bottom: window.innerHeight - pos.btnTop + 4,
        left: pos.left,
        minWidth: pos.width,
      };
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
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

      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-[60] bg-white border border-stone-200 rounded-lg shadow-xl overflow-hidden max-h-[60vh] overflow-y-auto"
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
