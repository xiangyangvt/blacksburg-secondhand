'use client';

import { useScrollPast } from '@/lib/useScrollPast';

/** 手机端浮动发布按钮：首屏胶囊形带"发布"标签，用户滚动后收成圆形 */
export function FabPostButton({
  onClick,
  label,
  ariaLabel,
}: {
  onClick: () => void;
  label: string;
  ariaLabel: string;
}) {
  const scrolled = useScrollPast(60);

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={`sm:hidden fixed right-5 bottom-5 z-20 h-14 rounded-full bg-brand text-white shadow-lg flex items-center justify-center hover:bg-brand-dark active:bg-brand-dark transition-all duration-300 overflow-hidden ${
        scrolled ? 'w-14 px-0' : 'w-auto pl-4 pr-5 gap-1.5'
      }`}
    >
      {/* 白色加号 — 用 SVG 保证颜色一致（emoji ➕ 在某些设备会变彩色/灰色） */}
      <svg
        width={scrolled ? 28 : 22}
        height={scrolled ? 28 : 22}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        className="transition-all"
      >
        <line x1="12" y1="5"  x2="12" y2="19" />
        <line x1="5"  y1="12" x2="19" y2="12" />
      </svg>
      {!scrolled && <span className="font-medium text-base">{label}</span>}
    </button>
  );
}
