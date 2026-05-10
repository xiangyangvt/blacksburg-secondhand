'use client';

import { useState } from 'react';
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

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white border border-stone-200 rounded-lg active:bg-stone-50"
      >
        <span className="flex items-center gap-2 text-sm">
          <span className="text-stone-500">🔍</span>
          <span className="font-medium text-stone-800">筛选</span>
          <span className="text-stone-500 truncate max-w-[200px]">{summary}</span>
        </span>
        <span className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-2 p-4 bg-white border border-stone-200 rounded-lg max-h-[55vh] overflow-y-auto shadow-lg">
          <FilterSidebar filters={filters} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
