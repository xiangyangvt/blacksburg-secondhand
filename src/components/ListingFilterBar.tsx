'use client';

// /roommates 头部筛选 chip 行
// 5 个 chip + 清空：类型 / 我能投（性别）/ 区域 / 预算 / 排序
// 所有 chip 在 mobile + desktop 都用同一套（flex-wrap）

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import {
  LISTING_TYPES,
  LISTING_AREAS,
} from '@/lib/utils';
import { SavedListingsButton } from './SavedListingsButton';

export type ListingFilters = {
  type: 'all' | string;          // listing type id
  canApplyAs: 'any' | 'F' | 'M';
  areas: string[];
  budgetMin: string;
  budgetMax: string;
  sort: 'newest' | 'oldest' | 'budgetAsc' | 'budgetDesc';
};

export const LISTING_FILTERS_DEFAULT: ListingFilters = {
  type: 'all',
  canApplyAs: 'any',
  areas: [],
  budgetMin: '',
  budgetMax: '',
  sort: 'newest',
};

export function ListingFilterBar({
  filters,
  onChange,
}: {
  filters: ListingFilters;
  onChange: (next: Partial<ListingFilters>) => void;
}) {
  const typeOptions = [
    { value: 'all', label: '所有类型', chipLabel: '类型' },
    ...LISTING_TYPES.map(t => ({ value: t.id, label: t.label, chipLabel: t.label })),
  ];

  const canApplyOptions = [
    { value: 'any', label: '不筛选性别', chipLabel: '性别' },
    { value: 'F',   label: '我是女生（看 any + 仅女生）', chipLabel: '女生可投' },
    { value: 'M',   label: '我是男生（看 any + 仅男生）', chipLabel: '男生可投' },
  ];

  const sortOptions = [
    { value: 'newest',     label: '最新',         chipLabel: '最新' },
    { value: 'oldest',     label: '最旧',         chipLabel: '最旧' },
    { value: 'budgetAsc',  label: '预算低 → 高',  chipLabel: '预算 ↑' },
    { value: 'budgetDesc', label: '预算高 → 低',  chipLabel: '预算 ↓' },
  ];

  const hasAny =
    filters.type !== 'all'
    || filters.canApplyAs !== 'any'
    || filters.areas.length > 0
    || filters.budgetMin || filters.budgetMax
    || filters.sort !== 'newest';

  const clearAll = () => onChange(LISTING_FILTERS_DEFAULT);

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 flex flex-wrap items-center gap-1.5 py-0.5">
        <ChipDropdown
          label="类型"
          value={filters.type}
          defaultValue="all"
          options={typeOptions}
          onChange={(v) => onChange({ type: v })}
        />
        <ChipDropdown
          label="性别"
          value={filters.canApplyAs}
          defaultValue="any"
          options={canApplyOptions}
          onChange={(v) => onChange({ canApplyAs: v as ListingFilters['canApplyAs'] })}
        />
        <AreasChip
          selected={filters.areas}
          onChange={(areas) => onChange({ areas })}
        />
        <BudgetChip
          min={filters.budgetMin}
          max={filters.budgetMax}
          onChange={(min, max) => onChange({ budgetMin: min, budgetMax: max })}
        />
        <ChipDropdown
          label="排序"
          value={filters.sort}
          defaultValue="newest"
          options={sortOptions}
          onChange={(v) => onChange({ sort: v as ListingFilters['sort'] })}
        />

        {hasAny && (
          <button
            type="button"
            onClick={clearAll}
            className="flex-shrink-0 text-xs text-stone-500 hover:text-stone-900 px-2 py-1.5 underline-offset-2 hover:underline whitespace-nowrap"
          >
            清空
          </button>
        )}
      </div>

      {/* 室友心愿单(独立于二手心愿单)— 跟 / 主页 CartButton 同位置但内容是 listings */}
      <SavedListingsButton className="self-start" />
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
  options: Array<{ value: T; label: string; chipLabel?: string }>;
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
  const selected = options.find(o => o.value === value);
  const chipText = active
    ? (selected?.chipLabel ?? selected?.label ?? '')
    : label;

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const popWidth = Math.max(rect.width, 180);
      const maxLeft = window.innerWidth - popWidth - 16;
      const left = Math.max(16, Math.min(rect.left, maxLeft));
      setPos({ top: rect.bottom + 4, left, minWidth: popWidth });
    }
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
        <span className="whitespace-nowrap">{chipText}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth, maxWidth: 'calc(100vw - 32px)' }}
          className="z-[60] bg-white border border-stone-200 rounded-lg shadow-overlay overflow-hidden max-h-[60dvh] overflow-y-auto"
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
   AreasChip: 多选区域
   ============================================================ */
function AreasChip({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (areas: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const active = selected.length > 0;
  const chipText = active
    ? (selected.length === 1 ? selected[0] : `区域 (${selected.length})`)
    : '区域';

  const POPOVER_W = 240;
  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const maxLeft = window.innerWidth - POPOVER_W - 16;
      const left = Math.max(16, Math.min(rect.left, maxLeft));
      setPos({ top: rect.bottom + 4, left });
    }
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

  const toggle = (a: string) => {
    onChange(selected.includes(a) ? selected.filter(x => x !== a) : [...selected, a]);
  };

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
        <span className="whitespace-nowrap">{chipText}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_W }}
          className="z-[60] bg-white border border-stone-200 rounded-lg shadow-overlay p-2 max-h-[60dvh] overflow-y-auto"
        >
          <div className="flex flex-wrap gap-1.5 mb-2">
            {LISTING_AREAS.map(a => {
              const sel = selected.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggle(a)}
                  className={`px-2.5 py-1 text-xs rounded-chip border transition-colors ${
                    sel
                      ? 'bg-brand/10 border-brand text-brand font-medium'
                      : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                  }`}
                >
                  {a}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between gap-2 pt-2 border-t border-stone-100">
            <button
              onClick={() => onChange([])}
              className="px-2 py-1 text-xs text-stone-500 hover:text-stone-900"
            >
              清空
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1 bg-brand text-white rounded-chip text-xs font-medium hover:bg-brand-dark"
            >
              完成
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ============================================================
   BudgetChip: 预算区间
   ============================================================ */
function BudgetChip({
  min, max, onChange,
}: {
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [localMin, setLocalMin] = useState(min);
  const [localMax, setLocalMax] = useState(max);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setLocalMin(min); setLocalMax(max); }, [min, max]);

  const active = !!min || !!max;
  const valueLabel = active ? `$${min || '0'}–${max || '∞'}` : '';
  const POPOVER_W = 260;

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const maxLeft = window.innerWidth - POPOVER_W - 16;
      const left = Math.max(16, Math.min(rect.left, maxLeft));
      setPos({ top: rect.bottom + 4, left });
    }
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

  const apply = () => { onChange(localMin, localMax); setOpen(false); };
  const clear = () => { onChange('', ''); setOpen(false); };

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
        <span className="whitespace-nowrap">{active ? valueLabel : '预算'}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_W }}
          className="z-[60] bg-white border border-stone-200 rounded-lg shadow-overlay p-3"
        >
          <div className="text-xs text-stone-500 mb-2">月租预算 (USD)</div>
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
