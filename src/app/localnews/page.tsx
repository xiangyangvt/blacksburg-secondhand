'use client';

// Sprint 7 Phase 2A:黑堡本地信息流(/localnews)
// IA:wordmark "黑堡" 点击落地于此;二手 / 室友&转租 仍是子平台 tab
//
// Phase 2A 功能(全套):
// 1. 类目筛选(动态,无数据自动隐藏)
// 2. 日期范围:今天/3 天/1 周/本月
// 3. 地理范围:本地/NRV/不限
// 4. 排序:时间/热度/距离
// 5. localStorage 持久化筛选状态
// 6. 搜索框客户端实时过滤
// 7. 卡片热度 🔥 icon(按 click 计数梯度)+ 点击触发 /api/events/[id]/click

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Sparkles, MessageCircle, ChevronDown } from 'lucide-react';
import { PlatformTabs } from '@/components/PlatformTabs';
import { SearchBox } from '@/components/SearchBox';
import { EventCard, type EventCardData } from '@/components/EventCard';
import { EventWishlistButton } from '@/components/EventWishlistButton';
import { distanceFromBlacksburg, isLocalCore, isWithinNrv } from '@/lib/eventDistance';

// ============ 筛选状态机 ============

type CatId = 'all' | 'events' | 'sports' | 'news' | 'discussion';
type DateRange = 'all' | 'today' | '3day' | 'week' | 'month';
type Sort = 'date' | 'hot' | 'distance';
type LocationScope = 'all' | 'local' | 'nrv';

type Filters = {
  cat: CatId;
  dateRange: DateRange;
  sort: Sort;
  locScope: LocationScope;
};

const DEFAULT_FILTERS: Filters = {
  cat: 'all',
  dateRange: 'all',
  sort: 'date',
  locScope: 'all',
};

const STORAGE_KEY = 'hb_localnews_filters';

const CATEGORIES: Array<{ id: CatId; label: string }> = [
  { id: 'all',        label: '全部' },
  { id: 'events',     label: '活动' },
  { id: 'sports',     label: '体育' },
  { id: 'news',       label: '新闻' },
  { id: 'discussion', label: '讨论' },
];

const DATE_RANGES: Array<{ id: DateRange; label: string }> = [
  { id: 'all',   label: '全部时间' },
  { id: 'today', label: '今天' },
  { id: '3day',  label: '3 天内' },
  { id: 'week',  label: '一周内' },
  { id: 'month', label: '本月' },
];

const LOC_SCOPES: Array<{ id: LocationScope; label: string }> = [
  { id: 'all',   label: '不限地区' },
  { id: 'local', label: '本地' },
  { id: 'nrv',   label: '整个 NRV' },
];

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'date',     label: '按时间' },
  { id: 'hot',      label: '按热度' },
  { id: 'distance', label: '按距离' },
];

// ============ 客户端 helpers ============

/** clickCount + 抓取年龄 → 热度分数。新鲜+多点击 → 高分 */
function hotScore(e: EventCardData & { clickCount?: number; scrapedAt?: string | Date | null }): number {
  const clicks = e.clickCount ?? 0;
  const scraped = e.scrapedAt ? new Date(e.scrapedAt).getTime() : Date.now() - 24 * 3600e3;
  const ageHours = Math.max(1, (Date.now() - scraped) / 3600e3);
  return clicks / ageHours;
}

function relevanceTime(e: EventCardData): number | null {
  const isPastBased = e.category === 'news' || e.category === 'discussion';
  const time = isPastBased ? e.publishedAt : e.startAt;
  if (!time) return null;
  const t = new Date(time).getTime();
  return isNaN(t) ? null : t;
}

function isInDateRange(e: EventCardData, range: DateRange): boolean {
  if (range === 'all') return true;
  const t = relevanceTime(e);
  if (t === null) return false; // 无时间字段的 — 仅在「全部时间」显示
  const days = Math.abs(t - Date.now()) / 86400e3;
  if (range === 'today') return days < 1;
  if (range === '3day') return days < 3;
  if (range === 'week') return days < 7;
  if (range === 'month') return days < 30;
  return true;
}

function isInLocScope(e: EventCardData, scope: LocationScope): boolean {
  if (scope === 'all') return true;
  // 新闻 / 讨论 本身没物理地点,不被地理筛选过滤
  if (e.category === 'news' || e.category === 'discussion') return true;
  if (scope === 'local') return isLocalCore(e.location);
  if (scope === 'nrv') return isWithinNrv(e.location);
  return true;
}

function searchMatch(e: EventCardData, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    e.title?.toLowerCase().includes(needle) ||
    (e.titleOriginal ?? '').toLowerCase().includes(needle) ||
    (e.description ?? '').toLowerCase().includes(needle) ||
    (e.location ?? '').toLowerCase().includes(needle)
  );
}

// ============ 主组件 ============

export default function LocalNewsPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [q, setQ] = useState('');
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // localStorage 初始化(SSR-safe:首次 render 用 default,mount 后 hydrate)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 防御:只接受已知 enum 值
        const next: Filters = { ...DEFAULT_FILTERS };
        if (CATEGORIES.find(c => c.id === parsed.cat)) next.cat = parsed.cat;
        if (DATE_RANGES.find(d => d.id === parsed.dateRange)) next.dateRange = parsed.dateRange;
        if (SORTS.find(s => s.id === parsed.sort)) next.sort = parsed.sort;
        if (LOC_SCOPES.find(l => l.id === parsed.locScope)) next.locScope = parsed.locScope;
        setFilters(next);
      }
    } catch { /* ignore */ }
  }, []);

  // 持久化筛选(每次 filters 变更写一次)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); }
    catch { /* quota / private mode */ }
  }, [filters]);

  // fetch:cat 变化时重新拉(date / sort / location 都是客户端 filter)
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const url = filters.cat === 'all'
      ? '/api/events?limit=80'
      : `/api/events?category=${filters.cat}&limit=80`;
    fetch(url)
      .then(r => r.ok ? r.json() : { events: [], availableCategories: [] })
      .then(d => {
        if (cancel) return;
        setEvents(d.events ?? []);
        // availableCategories 跟 cat 筛选无关 — API 返回的总是全 dataset 的(我们配合 baseWhere)
        if (Array.isArray(d.availableCategories)) {
          setAvailableCategories(d.availableCategories);
        }
      })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [filters.cat]);

  // 应用 search + date + location + sort
  const visible = useMemo(() => {
    let arr = events
      .filter(e => searchMatch(e, q))
      .filter(e => isInDateRange(e, filters.dateRange))
      .filter(e => isInLocScope(e, filters.locScope));

    if (filters.sort === 'hot') {
      arr = [...arr].sort((a, b) => hotScore(b as any) - hotScore(a as any));
    } else if (filters.sort === 'distance') {
      arr = [...arr].sort(
        (a, b) => distanceFromBlacksburg(a.location) - distanceFromBlacksburg(b.location),
      );
    }
    // sort === 'date' 用 API 默认顺序(已按 relevance 排好)
    return arr;
  }, [events, q, filters.dateRange, filters.locScope, filters.sort]);

  // 动态 category chips:availableCategories 里有的才显
  const visibleCategoryChips = useMemo(() => {
    return CATEGORIES.filter(c => c.id === 'all' || availableCategories.includes(c.id));
  }, [availableCategories]);

  // 我的 button -> 触发 wishlist panel
  const openMyPanel = useCallback(() => {
    window.dispatchEvent(new Event('hb-open-event-wishlist'));
  }, []);

  // 单字段 updater(避免 inline { ...filters, x: v })
  const updateFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  return (
    <main className="min-h-screen">
      {/* 顶栏 — 跟 / 和 /roommates 同款 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
          <PlatformTabs />
          <SearchBox value={q} onChange={setQ} placeholder="搜索活动、地点、组织" />
          <div className="flex-1 hidden md:block" />
          <button
            onClick={openMyPanel}
            className="relative px-3 sm:px-4 py-2 rounded-chip text-sm font-medium whitespace-nowrap bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors"
          >
            我的
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 md:px-4 py-4">
        {/* Chat 入口占位(Phase 3 实做) */}
        <div className="mb-4 p-4 rounded-card bg-gradient-to-br from-stone-50 to-stone-100 border border-stone-200 flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
            <Sparkles size={18} className="text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-stone-900 text-sm mb-0.5 flex items-center gap-2">
              问黑堡本地
              <span className="text-xs text-stone-400 font-normal">即将推出</span>
            </div>
            <div className="text-xs text-stone-500">
              比如:周末有什么好玩的?附近哪家中餐推荐?VT vs Duke 哪天打?
            </div>
          </div>
          <MessageCircle size={20} className="text-stone-300 flex-shrink-0" />
        </div>

        {/* === 主筛选行:类别 chips + 心愿单 === */}
        <div className="mb-2 flex items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar flex-1 min-w-0">
            {visibleCategoryChips.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => updateFilter('cat', c.id)}
                className={`px-3 py-1.5 rounded-chip text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  filters.cat === c.id
                    ? 'bg-brand text-white'
                    : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <EventWishlistButton className="flex-shrink-0" />
        </div>

        {/* === 次筛选行:日期 + 地理 + 排序 === */}
        <div className="mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {/* 日期 dropdown */}
          <FilterDropdown
            label={DATE_RANGES.find(d => d.id === filters.dateRange)!.label}
            active={filters.dateRange !== 'all'}
            options={DATE_RANGES}
            value={filters.dateRange}
            onChange={(v) => updateFilter('dateRange', v as DateRange)}
          />
          {/* 地理 dropdown */}
          <FilterDropdown
            label={LOC_SCOPES.find(l => l.id === filters.locScope)!.label}
            active={filters.locScope !== 'all'}
            options={LOC_SCOPES}
            value={filters.locScope}
            onChange={(v) => updateFilter('locScope', v as LocationScope)}
          />
          {/* 排序 dropdown */}
          <FilterDropdown
            label={SORTS.find(s => s.id === filters.sort)!.label}
            active={filters.sort !== 'date'}
            options={SORTS}
            value={filters.sort}
            onChange={(v) => updateFilter('sort', v as Sort)}
          />
        </div>

        {/* 过滤结果统计 + 清空 */}
        {!loading && (filters.dateRange !== 'all' || filters.locScope !== 'all' || filters.sort !== 'date' || q) && (
          <div className="mb-3 flex items-center gap-2 text-xs text-stone-500 px-1">
            <span>共 {visible.length} 条</span>
            <button
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setQ('');
              }}
              className="ml-auto text-brand hover:text-brand-dark underline"
            >
              清空筛选 →
            </button>
          </div>
        )}

        {/* 内容 */}
        {loading ? (
          <SkeletonGrid />
        ) : visible.length === 0 ? (
          <EmptyState hasFilters={filters.dateRange !== 'all' || filters.locScope !== 'all' || !!q.trim()} cat={filters.cat} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
            {visible.map(e => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        )}

        {/* 角注 */}
        <p className="text-xs text-stone-400 mt-8 text-center">
          每天早上 7 点自动更新 · 内容版权归各源站所有 · 点卡片展开看详情
        </p>
      </div>
    </main>
  );
}

// ============ 子组件 ============

function FilterDropdown<T extends string>({
  label, active, options, value, onChange,
}: {
  label: string;
  active: boolean;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);

  // 点外关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-filter-dropdown]')) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" data-filter-dropdown>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-chip text-sm font-medium whitespace-nowrap transition-colors border ${
          active
            ? 'bg-brand/10 text-brand border-brand/30'
            : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
        }`}
      >
        {label}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-white rounded-card shadow-overlay border border-stone-200 min-w-[140px] py-1">
          {options.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                value === opt.id
                  ? 'bg-brand/10 text-brand font-medium'
                  : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white rounded-card border border-stone-200 overflow-hidden animate-pulse">
          <div className="aspect-[4/3] md:aspect-[16/9] bg-stone-100" />
          <div className="p-3 md:p-4 space-y-2">
            <div className="h-4 w-16 bg-stone-200 rounded-full" />
            <div className="h-5 bg-stone-200 rounded w-3/4" />
            <div className="h-3 bg-stone-100 rounded w-1/2" />
            <div className="h-4 bg-stone-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ cat, hasFilters }: { cat: CatId; hasFilters: boolean }) {
  return (
    <div className="text-center py-20 text-stone-500">
      <div className="text-5xl mb-4 opacity-40">🌱</div>
      <div className="mb-2">
        {hasFilters
          ? '没有匹配当前筛选的内容'
          : cat === 'all'
            ? '暂无本地内容'
            : `暂无「${CATEGORIES.find(c => c.id === cat)?.label}」类别内容`}
      </div>
      <div className="text-xs text-stone-400">
        每天早上 7 点 GitHub Actions 会自动抓取本地源,生成中文摘要
      </div>
    </div>
  );
}
