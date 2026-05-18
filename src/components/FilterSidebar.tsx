'use client';

import { Clock } from 'lucide-react';
import { CartButton } from './CartButton';
import { CATEGORIES } from '@/lib/utils';
import { useT } from '@/i18n/I18nProvider';
import { Dropdown } from './Dropdown';

export type Filters = {
  type:     'all' | 'sell' | 'buy';
  category: 'all' | string;
  q:        string;
  minPrice: string;
  maxPrice: string;
  since:    'all' | '1d' | '1w' | '1m';
  sort:     'random' | 'newest' | 'oldest' | 'priceAsc' | 'priceDesc';
  /** 只看我最近浏览过的（localStorage 里的 recentViewIds） — client-side 过滤 */
  onlyRecent?: boolean;
  /** Sprint 6.7g:按卖家 contactValue 过滤(同卖家曝光 toast "去看看"触发);设置后 banner 显示 + ✕ 清除 */
  seller?:    string;
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
      {/* 桌面端心愿单 + 最近看过 toggle —— 顶部独立小栏(Sprint 6.7 回退到 sidebar) */}
      <div className="flex items-center justify-between gap-2 bg-white border border-stone-200 rounded-lg p-2">
        <button
          type="button"
          onClick={() => onChange({ onlyRecent: !filters.onlyRecent })}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-chip border text-xs transition-colors ${
            filters.onlyRecent
              ? 'border-brand bg-brand/10 text-brand font-medium'
              : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
          }`}
        >
          <Clock size={13} />
          最近看过
        </button>
        <CartButton />
      </div>

      {/* 分类 — 手机平铺换行，桌面纵列 */}
      <div>
        <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.category')}</h3>
        <div className="flex flex-wrap md:flex-col gap-2 md:gap-1">
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
        <div className="flex flex-wrap gap-2">
          {(['all', 'sell', 'buy'] as const).map(typ => (
            <button
              key={typ}
              onClick={() => onChange({ type: typ })}
              className={`px-4 py-2 text-sm rounded-full border min-w-[64px] ${
                filters.type === typ
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-stone-700 border-stone-300 hover:border-brand active:bg-stone-100'
              }`}
            >
              {typ === 'all' ? t('filter.all') : typ === 'sell' ? t('type.sell') : t('type.buy')}
            </button>
          ))}
        </div>
      </div>

      {/* 价格 — text-base (16px) 防 iOS 自动 zoom */}
      <div>
        <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.price')}</h3>
        <div className="flex items-center gap-2">
          <input
            type="number" inputMode="numeric" min={0}
            value={filters.minPrice}
            onChange={e => onChange({ minPrice: e.target.value })}
            placeholder="0"
            className="w-20 border border-stone-300 rounded px-2 py-1.5 text-base"
          />
          <span className="text-stone-400">—</span>
          <input
            type="number" inputMode="numeric" min={0}
            value={filters.maxPrice}
            onChange={e => onChange({ maxPrice: e.target.value })}
            placeholder="∞"
            className="w-20 border border-stone-300 rounded px-2 py-1.5 text-base"
          />
        </div>
      </div>

      {/* 日期 + 排序 同一行 — 节省纵向空间 */}
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.date')}</h3>
          <Dropdown
            value={filters.since}
            onChange={v => onChange({ since: v as Filters['since'] })}
            options={[
              { value: 'all', label: t('date.all') },
              { value: '1d',  label: t('date.1d')  },
              { value: '1w',  label: t('date.1w')  },
              { value: '1m',  label: t('date.1m')  },
            ]}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs uppercase font-semibold text-stone-500 mb-2">{t('filter.sort')}</h3>
          <Dropdown
            value={filters.sort}
            onChange={v => onChange({ sort: v as Filters['sort'] })}
            options={[
              { value: 'random',    label: t('sort.random')    },
              { value: 'newest',    label: t('sort.newest')    },
              { value: 'oldest',    label: t('sort.oldest')    },
              { value: 'priceAsc',  label: t('sort.priceAsc')  },
              { value: 'priceDesc', label: t('sort.priceDesc') },
            ]}
          />
        </div>
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
      className={`text-sm whitespace-nowrap px-4 py-2 rounded-full border md:rounded md:border-0 md:text-left md:py-1.5 md:px-3 ${
        active
          ? 'bg-brand text-white border-brand'
          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100 active:bg-stone-200'
      }`}
    >
      {children}
    </button>
  );
}
