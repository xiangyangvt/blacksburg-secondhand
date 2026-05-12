'use client';

// 手机端筛选：chip row 设计（v2）
// - 显示当前所有 active filter 为可移除 chips
// - 末尾"⋯ 更多"chip 打开底部 sheet（含完整 FilterSidebar）
// - 视觉模型借鉴 Airbnb / Carousell / Mercari

import { useState, useRef } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { FilterSidebar, type Filters } from './FilterSidebar';
import { CATEGORIES } from '@/lib/utils';
import { useT } from '@/i18n/I18nProvider';

type ChipDef = {
  /** 用于 key + 移除时 onChange 提供 reset patch */
  key: string;
  /** chip 上显示的文字 */
  label: string;
  /** 点 × 时把这个 patch 传给 onChange 重置该 filter */
  reset: Partial<Filters>;
};

export function MobileFilterToggle({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  const t = useT();
  const [sheetOpen, setSheetOpen] = useState(false);

  // 计算当前有哪些 active filter（非默认值的 chips）
  const chips: ChipDef[] = [];

  if (filters.type !== 'all') {
    chips.push({
      key: 'type',
      label: filters.type === 'sell' ? t('type.sell') : t('type.buy'),
      reset: { type: 'all' },
    });
  }
  if (filters.category !== 'all') {
    const cat = CATEGORIES.find(c => c.id === filters.category);
    chips.push({
      key: 'category',
      label: cat ? t(cat.i18nKey) : t('cat.other'),
      reset: { category: 'all' },
    });
  }
  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice || '0';
    const max = filters.maxPrice || '∞';
    chips.push({
      key: 'price',
      label: `$${min}–${max}`,
      reset: { minPrice: '', maxPrice: '' },
    });
  }
  if (filters.since !== 'all') {
    chips.push({
      key: 'since',
      label: t(`date.${filters.since}` as any),
      reset: { since: 'all' },
    });
  }
  if (filters.sort !== 'newest') {
    chips.push({
      key: 'sort',
      label: t(`sort.${filters.sort}` as any),
      reset: { sort: 'newest' },
    });
  }

  // 拖动收起 sheet
  const dragStartY = useRef<number | null>(null);
  const onHandleTouchStart = (e: React.TouchEvent) => { dragStartY.current = e.touches[0].clientY; };
  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy < -25) { setSheetOpen(false); dragStartY.current = null; }
  };
  const onHandleTouchEnd = () => { dragStartY.current = null; };

  return (
    <div className="md:hidden">
      {/* Chip row：横向滚动，无 active 时也显示"⋯ 筛选"入口 */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {/* "⋯ 筛选 / 更多" chip：常驻入口 */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`flex items-center gap-1.5 flex-shrink-0 rounded-chip border text-sm transition-colors px-3 py-1.5 ${
            chips.length > 0
              ? 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
              : 'bg-stone-100 border-stone-200 text-stone-700 hover:bg-stone-200'
          }`}
          aria-label="打开筛选面板"
        >
          <SlidersHorizontal size={14} />
          <span>{chips.length > 0 ? '更多' : '筛选'}</span>
        </button>

        {/* 当前 active filters 的 chip */}
        {chips.map(c => (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.reset)}
            className="flex items-center gap-1 flex-shrink-0 rounded-chip border border-brand/30 bg-brand/5 text-brand text-sm px-3 py-1.5 hover:bg-brand/10 transition-colors"
            aria-label={`移除筛选: ${c.label}`}
          >
            <span>{c.label}</span>
            <X size={13} />
          </button>
        ))}
      </div>

      {/* 底部 sheet：完整 FilterSidebar */}
      {sheetOpen && (
        <>
          {/* 背景遮罩 */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSheetOpen(false)}
          />
          {/* sheet 容器：从底部滑上来；max-h 70vh */}
          <div className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-overlay max-h-[80vh] flex flex-col">
            {/* 顶部 drag handle */}
            <div
              className="flex justify-center py-3 cursor-pointer active:bg-stone-50"
              onClick={() => setSheetOpen(false)}
              onTouchStart={onHandleTouchStart}
              onTouchMove={onHandleTouchMove}
              onTouchEnd={onHandleTouchEnd}
              role="button"
              aria-label="收起筛选（点击或下滑）"
            >
              <span className="block w-10 h-1 bg-stone-300 rounded-full" />
            </div>

            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 pb-2 border-b border-stone-100">
              <h2 className="text-base font-semibold text-stone-900">筛选</h2>
              <button
                onClick={() => setSheetOpen(false)}
                className="text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100"
                aria-label="关闭"
              >
                <X size={20} />
              </button>
            </div>

            {/* 内容 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <FilterSidebar filters={filters} onChange={onChange} />
            </div>

            {/* 底部 "完成" CTA */}
            <div className="border-t border-stone-200 px-4 py-3 bg-white">
              <button
                onClick={() => setSheetOpen(false)}
                className="w-full py-3 bg-brand text-white rounded-chip font-medium hover:bg-brand-dark active:scale-95 transition-all"
              >
                完成
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
