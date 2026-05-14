'use client';

// HelpHint —— 紧凑的 "?" 帮助按钮 + 弹出说明
// 设计哲学:Truncated Pyramid —— 默认极简,用户主动展开才显示详情
// 桌面 / 移动统一外观:点击触发 modal-like 浮层(移动从底部滑入,桌面居中)
// 跟 UX_BATCH §〇 元规则一致:不增加默认界面复杂度,只多一个 ~14px 圆圈

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, X } from 'lucide-react';

export function HelpHint({
  label,
  children,
  size = 14,
  className = '',
}: {
  /** 用作 aria-label + popup 标题。简短一句话(< 12 字) */
  label: string;
  /** popup 内容,可富文本 */
  children: React.ReactNode;
  /** icon 大小,默认 14px */
  size?: number;
  /** 给外层按钮加 className(比如对齐) */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // ESC 关
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 打开时 focus 到 close 按钮,a11y 友好
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => closeBtnRef.current?.focus());
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={`inline-flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors ${className}`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <CircleHelp size={size} strokeWidth={2} />
      </button>
      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className="bg-white w-full md:max-w-md rounded-t-card md:rounded-card shadow-overlay overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-bottom-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
              <h3 className="text-sm font-semibold text-stone-900">{label}</h3>
              <button
                ref={closeBtnRef}
                onClick={() => setOpen(false)}
                className="text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100"
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 text-sm text-stone-700 leading-relaxed space-y-2">
              {children}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
