'use client';

import { useState, useRef } from 'react';
import { FilterSidebar, type Filters } from './FilterSidebar';
import { CATEGORIES } from '@/lib/utils';
import { useT } from '@/i18n/I18nProvider';

/** 手机端：默认折叠的筛选区。点击展开整个 FilterSidebar */
export function MobileFilterToggle({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // 当前筛选的简短摘要（让用户一眼看到筛了什么）
  const catLabel  = filters.category === 'all'
    ? t('filter.all')
    : t((CATEGORIES.find(c => c.id === filters.category)?.i18nKey) ?? 'cat.other');
  const typeLabel = filters.type === 'all' ? t('filter.all')
    : filters.type === 'sell' ? t('type.sell')
    : t('type.buy');
  const sortLabel = filters.sort === 'newest' ? t('sort.newest')
    : filters.sort === 'oldest' ? t('sort.oldest')
    : filters.sort === 'priceAsc' ? t('sort.priceAsc')
    : t('sort.priceDesc');

  const summary = [catLabel, typeLabel, sortLabel].join(' · ');

  // 把手的滑动手势：按下记录起点，向上滑超过 25px 即关闭
  const dragStartY = useRef<number | null>(null);
  const onHandleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy < -25) {
      setOpen(false);
      dragStartY.current = null;
    }
  };
  const onHandleTouchEnd = () => { dragStartY.current = null; };

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white border border-stone-200 rounded-lg active:bg-stone-50"
      >
        <span className="flex items-center gap-2 text-sm min-w-0">
          {/* 漏斗图标 = filter（国际通用） */}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-stone-500 flex-shrink-0">
            <path d="M3 4h14l-5.5 7v5L8.5 18v-7L3 4z" />
          </svg>
          <span className="font-medium text-stone-800 flex-shrink-0">筛选</span>
          <span className="text-stone-500 truncate">{summary}</span>
        </span>
        <span className={`text-stone-400 transition-transform flex-shrink-0 ml-2 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-2 bg-white border border-stone-200 rounded-lg max-h-[55vh] overflow-y-auto shadow-lg">
          <div className="p-4">
            <FilterSidebar filters={filters} onChange={onChange} />
          </div>

          {/* 底部把手：点一下或上滑都能收起 */}
          <div
            className="sticky bottom-0 bg-white border-t border-stone-100 py-2 flex justify-center cursor-pointer active:bg-stone-50"
            onClick={() => setOpen(false)}
            onTouchStart={onHandleTouchStart}
            onTouchMove={onHandleTouchMove}
            onTouchEnd={onHandleTouchEnd}
            role="button"
            aria-label="收起筛选（点击或上滑）"
          >
            <span className="block w-12 h-1.5 bg-stone-300 rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
}
