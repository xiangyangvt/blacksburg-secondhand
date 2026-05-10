'use client';

import { CATEGORIES } from '@/lib/utils';
import { useT } from '@/i18n/I18nProvider';

export type Filters = {
  type:     'all' | 'sell' | 'buy';
  category: 'all' | string;
  q:        string;
  minPrice: string;
  maxPrice: string;
  since:    'all' | '1d' | '1w' | '1m';
  sort:     'newest' | 'oldest' | 'priceAsc' | 'priceDesc';
};

export function FilterSidebar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  const t = useT();

  return (
    <aside className="md:w-56 md:flex-shrink-0 space-y-4">
      {/* 分类 */}
      <div>
        <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.category')}</h3>
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible no-scrollbar">
          <CatBtn active={filters.category === 'all'} onClick={() => onChange({ category: 'all' })}>
            {t('filter.all')}
          </CatBtn>
          {CATEGORIES.map(c => (
            <CatBtn
              key={c.id}
              active={filters.category === c.id}
              onClick={() => onChange({ category: c.id })}
            >
              {t(c.i18nKey)}
            </CatBtn>
          ))}
        </div>
      </div>

      {/* 类型 */}
      <div>
        <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.type')}</h3>
        <div className="flex gap-1">
          {(['all', 'sell', 'buy'] as const).map(typ => (
            <button
              key={typ}
              onClick={() => onChange({ type: typ })}
              className={`px-3 py-1 text-sm rounded border ${
                filters.type === typ
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-stone-700 border-stone-300 hover:border-brand'
              }`}
            >
              {typ === 'all' ? t('filter.all') : typ === 'sell' ? t('type.sell') : t('type.buy')}
            </button>
          ))}
        </div>
      </div>

      {/* 价格 */}
      <div>
        <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.price')}</h3>
        <div className="flex items-center gap-1 text-sm">
          <input
            type="number" min={0}
            value={filters.minPrice}
            onChange={e => onChange({ minPrice: e.target.value })}
            placeholder="0"
            className="w-16 border border-stone-300 rounded px-2 py-1"
          />
          <span>—</span>
          <input
            type="number" min={0}
            value={filters.maxPrice}
            onChange={e => onChange({ maxPrice: e.target.value })}
            placeholder="∞"
            className="w-16 border border-stone-300 rounded px-2 py-1"
          />
        </div>
      </div>

      {/* 日期 */}
      <div>
        <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.date')}</h3>
        <select
          value={filters.since}
          onChange={e => onChange({ since: e.target.value as any })}
          className="w-full border border-stone-300 rounded px-2 py-1 text-sm"
        >
          <option value="all">{t('date.all')}</option>
          <option value="1d">{t('date.1d')}</option>
          <option value="1w">{t('date.1w')}</option>
          <option value="1m">{t('date.1m')}</option>
        </select>
      </div>

      {/* 排序 */}
      <div>
        <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.sort')}</h3>
        <select
          value={filters.sort}
          onChange={e => onChange({ sort: e.target.value as any })}
          className="w-full border border-stone-300 rounded px-2 py-1 text-sm"
        >
          <option value="newest">{t('sort.newest')}</option>
          <option value="oldest">{t('sort.oldest')}</option>
          <option value="priceAsc">{t('sort.priceAsc')}</option>
          <option value="priceDesc">{t('sort.priceDesc')}</option>
        </select>
      </div>
    </aside>
  );
}

function CatBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-sm whitespace-nowrap px-3 py-1.5 rounded text-left ${
        active
          ? 'bg-brand text-white'
          : 'bg-white text-stone-700 hover:bg-stone-100'
      }`}
    >
      {children}
    </button>
  );
}
