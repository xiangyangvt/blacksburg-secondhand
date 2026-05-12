'use client';

// 手机端筛选 v3：3 个常驻 chip + 更多
// - 类目 / 排序 / 价格 永远可见，每个 chip 打开自己的小 popover
// - "⋯ 更多" 打开 bottom sheet（含类型 + 时间 + 清空所有）
// - 设计目标：discoverability 优先于视觉极简

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, ChevronDown, X } from 'lucide-react';
import { FilterSidebar, type Filters } from './FilterSidebar';
import { CATEGORIES } from '@/lib/utils';
import { useT } from '@/i18n/I18nProvider';

export function MobileFilterToggle({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  const t = useT();
  const [sheetOpen, setSheetOpen] = useState(false);

  const categoryOptions = [
    { value: 'all',          label: t('filter.all') },
    ...CATEGORIES.map(c => ({ value: c.id, label: t(c.i18nKey) })),
  ];
  const sortOptions = [
    { value: 'newest',    label: t('sort.newest')    },
    { value: 'oldest',    label: t('sort.oldest')    },
    { value: 'priceAsc',  label: t('sort.priceAsc')  },
    { value: 'priceDesc', label: t('sort.priceDesc') },
  ];

  const hasAnyFilter =
    filters.type !== 'all'
    || filters.category !== 'all'
    || filters.minPrice || filters.maxPrice
    || filters.since !== 'all'
    || filters.sort !== 'newest';

  const clearAll = () => onChange({
    type: 'all', category: 'all',
    minPrice: '', maxPrice: '',
    since: 'all', sort: 'newest',
  });

  return (
    <div className="md:hidden">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        <ChipDropdown
          label="类目"
          value={filters.category}
          options={categoryOptions}
          defaultValue="all"
          onChange={(v) => onChange({ category: v })}
        />
        <ChipDropdown
          label="排序"
          value={filters.sort}
          options={sortOptions}
          defaultValue="newest"
          onChange={(v) => onChange({ sort: v as Filters['sort'] })}
        />
        <PriceChip filters={filters} onChange={onChange} />

        {/* 更多 */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1.5 flex-shrink-0 rounded-chip border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 text-sm px-3 py-1.5 transition-colors"
        >
          <SlidersHorizontal size={13} />
          更多
        </button>

        {/* 一键清空（仅有 active filter 时才出现） */}
        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="flex-shrink-0 text-xs text-stone-500 hover:text-stone-900 px-2 py-1.5 underline-offset-2 hover:underline whitespace-nowrap"
          >
            清空
          </button>
        )}
      </div>

      {/* 更多 sheet：里面装类型 + 时间 (类目/排序/价格 已在 chip 里覆盖) */}
      {sheetOpen && <MoreSheet filters={filters} onChange={onChange} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

/* ============================================================
   ChipDropdown: 单 chip + portal popover 单选下拉
   ============================================================ */
function ChipDropdown<T extends string>({
  label,
  value,
  options,
  defaultValue,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  defaultValue: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const active = value !== defaultValue;
  const currentLabel = options.find(o => o.value === value)?.label ?? '';

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left, minWidth: Math.max(rect.width, 140) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onClose = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
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
        className={`flex items-center gap-1 flex-shrink-0 rounded-chip border text-sm px-3 py-1.5 transition-colors ${
          active
            ? 'border-brand bg-brand/10 text-brand font-medium'
            : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
        }`}
      >
        <span className="whitespace-nowrap">{active ? `${label}: ${currentLabel}` : label}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth }}
          className="z-[60] bg-white border border-stone-200 rounded-lg shadow-overlay overflow-hidden max-h-[60vh] overflow-y-auto"
        >
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                o.value === value
                  ? 'bg-brand/5 text-brand font-medium'
                  : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

/* ============================================================
   PriceChip: 价格区间 chip + popover
   ============================================================ */
function PriceChip({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [localMin, setLocalMin] = useState(filters.minPrice);
  const [localMax, setLocalMax] = useState(filters.maxPrice);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setLocalMin(filters.minPrice); setLocalMax(filters.maxPrice); }, [filters.minPrice, filters.maxPrice]);

  const active = !!filters.minPrice || !!filters.maxPrice;
  const valueLabel = active
    ? `$${filters.minPrice || '0'}–${filters.maxPrice || '∞'}`
    : '';

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  const apply = () => { onChange({ minPrice: localMin, maxPrice: localMax }); setOpen(false); };
  const clear = () => { onChange({ minPrice: '', maxPrice: '' }); setOpen(false); };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openMenu()}
        className={`flex items-center gap-1 flex-shrink-0 rounded-chip border text-sm px-3 py-1.5 transition-colors ${
          active
            ? 'border-brand bg-brand/10 text-brand font-medium'
            : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
        }`}
      >
        <span className="whitespace-nowrap">{active ? valueLabel : '价格'}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: 240 }}
          className="z-[60] bg-white border border-stone-200 rounded-lg shadow-overlay p-3"
        >
          <div className="text-xs text-stone-500 mb-2">价格 (USD)</div>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="number" inputMode="numeric" min={0}
              value={localMin}
              onChange={e => setLocalMin(e.target.value)}
              placeholder="0"
              className="w-20 border border-stone-300 rounded px-2 py-1.5"
            />
            <span className="text-stone-400">—</span>
            <input
              type="number" inputMode="numeric" min={0}
              value={localMax}
              onChange={e => setLocalMax(e.target.value)}
              placeholder="∞"
              className="w-20 border border-stone-300 rounded px-2 py-1.5"
            />
          </div>
          <div className="flex justify-between gap-2">
            <button
              onClick={clear}
              className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-900 underline-offset-2 hover:underline"
            >
              清除
            </button>
            <button
              onClick={apply}
              className="px-4 py-1.5 bg-brand text-white rounded-chip text-sm font-medium hover:bg-brand-dark"
            >
              应用
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ============================================================
   MoreSheet: bottom sheet 装类型 + 时间 + 全部清空
   ============================================================ */
function MoreSheet({
  filters,
  onChange,
  onClose,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
  onClose: () => void;
}) {
  const t = useT();
  const dragStartY = useRef<number | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-overlay max-h-[70vh] flex flex-col">
        <div
          className="flex justify-center py-3"
          onTouchStart={e => { dragStartY.current = e.touches[0].clientY; }}
          onTouchMove={e => {
            if (dragStartY.current === null) return;
            if (e.touches[0].clientY - dragStartY.current > 30) { onClose(); dragStartY.current = null; }
          }}
        >
          <span className="block w-10 h-1 bg-stone-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2">
          <h2 className="text-base font-semibold text-stone-900">更多筛选</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-stone-100" aria-label="关闭"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 类型 */}
          <div>
            <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.type')}</h3>
            <div className="flex flex-wrap gap-2">
              {(['all', 'sell', 'buy'] as const).map(typ => (
                <button
                  key={typ}
                  onClick={() => onChange({ type: typ })}
                  className={`px-4 py-2 text-sm rounded-full border min-w-[64px] ${
                    filters.type === typ
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-stone-700 border-stone-300'
                  }`}
                >
                  {typ === 'all' ? t('filter.all') : typ === 'sell' ? t('type.sell') : t('type.buy')}
                </button>
              ))}
            </div>
          </div>

          {/* 时间 */}
          <div>
            <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.date')}</h3>
            <div className="flex flex-wrap gap-2">
              {(['all', '1d', '1w', '1m'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => onChange({ since: d })}
                  className={`px-4 py-2 text-sm rounded-full border ${
                    filters.since === d
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-stone-700 border-stone-300'
                  }`}
                >
                  {t(`date.${d}` as any)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-stone-200 px-4 py-3 flex items-center justify-between gap-2">
          <button
            onClick={() => onChange({
              type: 'all', category: 'all',
              minPrice: '', maxPrice: '',
              since: 'all', sort: 'newest',
            })}
            className="text-sm text-stone-600 hover:text-stone-900 underline-offset-2 hover:underline px-2"
          >
            全部清空
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-brand text-white rounded-chip font-medium hover:bg-brand-dark active:scale-95 transition-all"
          >
            完成
          </button>
        </div>
      </div>
    </>
  );
}

/* 让 unused 的 FilterSidebar import 不被 lint 吵——这个文件 v3 之后不直接渲染整个 FilterSidebar */
void FilterSidebar;
