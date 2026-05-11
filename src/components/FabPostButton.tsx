'use client';

import { Plus } from 'lucide-react';
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
      className={`sm:hidden fixed right-5 bottom-5 z-20 h-14 rounded-full bg-brand text-white shadow-overlay flex items-center justify-center hover:bg-brand-dark active:scale-95 transition-all duration-250 overflow-hidden ${
        scrolled ? 'w-14 px-0' : 'w-auto pl-4 pr-5 gap-1.5'
      }`}
    >
      <Plus size={scrolled ? 28 : 22} strokeWidth={2.75} className="transition-all" />
      {!scrolled && <span className="font-medium text-base">{label}</span>}
    </button>
  );
}
