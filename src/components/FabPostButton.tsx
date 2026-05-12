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
      className={`sm:hidden fixed right-5 bottom-5 z-20 h-14 rounded-full text-white shadow-overlay flex items-center justify-center active:scale-95 transition-all duration-250 overflow-hidden backdrop-blur-sm ${
        scrolled
          // 滚动后：变小 + 半透明，让 brand 色不再"压"到卡片上；hover/active 时恢复实色
          ? 'w-14 px-0 bg-brand/75 hover:bg-brand'
          // 首屏：实色胶囊，引导新用户"发布"
          : 'w-auto pl-4 pr-5 gap-1.5 bg-brand hover:bg-brand-dark'
      }`}
    >
      <Plus size={scrolled ? 28 : 22} strokeWidth={2.75} className="transition-all" />
      {!scrolled && <span className="font-medium text-base">{label}</span>}
    </button>
  );
}
