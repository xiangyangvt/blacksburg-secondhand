'use client';

// 平台切换器 v2：
//  - wordmark 本身就是 trigger（▾ 暗示可切换）
//  - 首次访问（localStorage 未标记）700ms 后自动展开，让新用户秒懂"两个平台"
//  - 用户在那 700ms 内任何交互（点 / 滚 / 触摸）取消自动展开
//  - 室友平台 wordmark：宽屏完整"黑堡室友 & 租房"，窄屏退回"黑堡室友"

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, ArrowRight } from 'lucide-react';

const PLATFORM_PICKED_KEY = 'hb_platform_picked';
const AUTO_OPEN_DELAY = 700;

type PlatformDef = {
  id: 'item' | 'roommate';
  href: string;
  /** 完整 accent（用在 menu item 标题里和宽屏 trigger）*/
  accent: string;
  /** trigger 在窄屏时只显示前面这部分 */
  accentShort: string;
  desc: string;
};

const PLATFORMS: PlatformDef[] = [
  { id: 'item',     href: '/',          accent: '二手',         accentShort: '二手', desc: '本地华人 / 学生二手物品交易' },
  { id: 'roommate', href: '/roommates', accent: '室友 & 租房', accentShort: '室友', desc: '找室友 · 合租 · 转租 · 暑期' },
];

export function PlatformSwitcher() {
  const pathname = usePathname() || '/';
  const currentId = pathname.startsWith('/roommates') ? 'roommate' : 'item';
  const current = PLATFORMS.find(p => p.id === currentId)!;

  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const markPicked = () => {
    try { window.localStorage.setItem(PLATFORM_PICKED_KEY, '1'); } catch {}
  };

  const computePos = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.max(8, rect.left - 4);
      setPos({ top: rect.bottom + 6, left });
    }
  };

  const openMenu = () => {
    computePos();
    setOpen(true);
  };

  // 首次访问：自动展开下拉；用户交互前 700ms 才弹
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(PLATFORM_PICKED_KEY)) return;
    } catch { return; }

    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finalize = () => {
      if (done) return;
      done = true;
      markPicked();
      document.removeEventListener('click', onInteract, true);
      document.removeEventListener('touchstart', onInteract, true);
      window.removeEventListener('scroll', onInteract);
    };

    const onInteract = () => {
      if (done) return;
      if (timer) clearTimeout(timer);
      finalize();
    };

    document.addEventListener('click', onInteract, true);
    document.addEventListener('touchstart', onInteract, true);
    window.addEventListener('scroll', onInteract, { passive: true });

    timer = setTimeout(() => {
      if (done) return;
      finalize();
      openMenu(); // 自动展开
    }, AUTO_OPEN_DELAY);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('click', onInteract, true);
      document.removeEventListener('touchstart', onInteract, true);
      window.removeEventListener('scroll', onInteract);
    };
  }, []);

  // 点外部、滚动、resize、ESC 都关闭
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onClose = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openMenu()}
        className="flex items-center gap-1 px-1 py-1 -mx-1 rounded hover:bg-stone-100 active:bg-stone-200 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="切换平台"
      >
        <span className="text-base sm:text-lg font-bold text-stone-900 whitespace-nowrap tracking-tight">
          黑堡
          <span className="text-brand">
            {current.accentShort}
            {/* 宽屏显示完整 accent 的后半部分（如" & 租房"）；窄屏隐藏省空间 */}
            {current.accent !== current.accentShort && (
              <span className="hidden sm:inline">
                {current.accent.slice(current.accentShort.length)}
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: 260, maxWidth: 'calc(100vw - 16px)' }}
          className="z-[60] bg-white border border-stone-200 rounded-lg shadow-overlay overflow-hidden"
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-stone-400 font-semibold border-b border-stone-100">
            选择平台
          </div>
          {PLATFORMS.map(p => {
            const isCurrent = p.id === currentId;
            const body = (
              <div className="flex items-center gap-2 px-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-900">
                    黑堡<span className="text-brand">{p.accent}</span>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">{p.desc}</div>
                </div>
                {isCurrent
                  ? <Check size={16} className="text-brand flex-shrink-0" />
                  : <ArrowRight size={14} className="text-stone-400 flex-shrink-0" />
                }
              </div>
            );

            return isCurrent ? (
              <div key={p.id} className="bg-brand/5 cursor-default">{body}</div>
            ) : (
              <Link
                key={p.id}
                href={p.href}
                onClick={() => { markPicked(); setOpen(false); }}
                className="block hover:bg-stone-100 transition-colors group"
              >
                {body}
              </Link>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
