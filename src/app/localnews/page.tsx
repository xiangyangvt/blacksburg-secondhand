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

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { ChevronDown, Plus, Leaf } from 'lucide-react';
import { PlatformTabs } from '@/components/PlatformTabs';
import { SearchBox } from '@/components/SearchBox';
import { EventCard, type EventCardData } from '@/components/EventCard';
import { EventWishlistButton } from '@/components/EventWishlistButton';
import { MyPostsPanel } from '@/components/MyPostsPanel';
import { EventPostModal, type EventPostInitial } from '@/components/EventPostModal';
import { FabPostButton } from '@/components/FabPostButton';
import { ScrollToTop } from '@/components/ScrollToTop';
import { LiveSection } from '@/components/LiveSection';
import { EditCodePrompt } from '@/components/EditCodePrompt';
import { showSuccess, showError } from '@/lib/toast';
import { distanceFromBlacksburg, isLocalCore, isWithinNrv } from '@/lib/eventDistance';

// Phase 3C: localStorage key — 跟 EventPostModal 共用
const LS_LAST_EDIT_CODE = 'hb_last_edit_code';

// ============ 筛选状态机 ============

// Phase 3B: 移除 'discussion'(Event 通用化后类目仅用于组活动 / 求助)
type CatId = 'all' | 'life' | 'exercise' | 'academic' | 'competition' | 'other';
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
  { id: 'all',         label: '全部' },
  { id: 'life',        label: '生活' },
  { id: 'exercise',    label: '运动' },
  { id: 'academic',    label: '学术' },
  { id: 'competition', label: '比赛' },
  { id: 'other',       label: '其他' },
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

// 选项内 label 是具体含义("按时间" / "按热度" / "按距离");
// 按钮文案逻辑在 render 时单独处理:sort=date 默认状态显「排序」,其它显选项 label
// 这样用户能从下拉里选「按时间」回到默认 — 跟「按热度/按距离」并列
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
  const isPastBased = e.category === 'discussion'; // 之前 news 也算,rename 后并入 discussion
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
  if (e.category === 'discussion') return true; // 讨论类不限本地(全球 Reddit)
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
  const [myPanelOpen, setMyPanelOpen] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // 发布后强制重新 fetch
  const mainListRef = useRef<HTMLDivElement>(null); // Live "看全部" 滚到主列表

  // Phase 3C: ⋯ 菜单 — 修改/删除走 EditCodePrompt 验证密码后才进行
  const [codePrompt, setCodePrompt] = useState<
    | { kind: 'edit' | 'delete'; event: EventCardData }
    | null
  >(null);
  // 验证通过后打开 EventPostModal edit mode 用的 initial
  const [editingInitial, setEditingInitial] = useState<EventPostInitial | null>(null);

  // Phase 3C handlers
  const handleEditEvent = (event: EventCardData) => setCodePrompt({ kind: 'edit', event });
  const handleDeleteEvent = (event: EventCardData) => setCodePrompt({ kind: 'delete', event });
  const handleReportEvent = async (event: EventCardData) => {
    const reason = prompt(`举报「${event.title}」 — 请说明原因(选填,但会帮我们判断):`);
    if (reason === null) return; // 用户取消
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'event', targetId: event.id, reason }),
      });
      if (res.ok) showSuccess('已收到举报,我们会查看');
      else showError('举报失败,请稍后再试');
    } catch {
      showError('网络故障,稍后再试');
    }
  };

  // Phase 3C: 把 EventCardData 转换成 EventPostModal 用的 EventPostInitial
  const toEditInitial = (e: EventCardData): EventPostInitial => ({
    id: e.id,
    title: e.title,
    category: e.category ?? 'life',
    customCategory: e.customCategory ?? null,
    description: e.description ?? '',
    startAt: typeof e.startAt === 'string' ? e.startAt : (e.startAt ? e.startAt.toISOString() : null),
    endAt: typeof e.endAt === 'string' ? e.endAt : (e.endAt ? e.endAt.toISOString() : null),
    location: e.location ?? null,
    posterNickname: e.posterNickname ?? '',
    posterContactType: e.posterContactType ?? null,
    posterContact: e.posterContact ?? null,
    posterContactLabel: e.posterContactLabel ?? null,
    posterContactPublic: !!e.posterContactPublic,
    maxAttendees: e.maxAttendees ?? null,
    photoUrls: Array.isArray(e.photoUrls) ? e.photoUrls : [],
  });

  // EditCodePrompt onConfirm — 根据 kind 走 verify+edit 或 delete
  const handleCodeConfirm = async (code: string) => {
    if (!codePrompt) return;
    const { kind, event } = codePrompt;

    if (kind === 'edit') {
      const res = await fetch(`/api/events/${event.id}/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.valid) {
        showError(data.error || '密码错误');
        return;
      }
      // 验证通过 → 把 code 存 LS,EventPostModal mount 时自动预填
      try { localStorage.setItem(LS_LAST_EDIT_CODE, code); } catch { /* ignore */ }
      setCodePrompt(null);
      setEditingInitial(toEditInitial(event));
      return;
    }

    if (kind === 'delete') {
      if (!confirm(`确认删除「${event.title}」?删除后不可恢复。`)) return;
      const res = await fetch(`/api/events/${event.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showError(data.error || '删除失败');
        return;
      }
      setCodePrompt(null);
      setRefreshKey(k => k + 1);
      showSuccess('已删除');
    }
  };

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
  // refreshKey 变化时也强制重 fetch(发布新 event 后)
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const url = filters.cat === 'all'
      ? '/api/events?limit=80'
      : `/api/events?category=${filters.cat}&limit=80`;
    fetch(url, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { events: [], availableCategories: [] })
      .then(d => {
        if (cancel) return;
        setEvents(d.events ?? []);
        if (Array.isArray(d.availableCategories)) {
          setAvailableCategories(d.availableCategories);
        }
      })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [filters.cat, refreshKey]);

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

  // 我的 button -> 打开 MyEventsPanel(留言 + 已发出 + 已收到 3 tab)
  // 注:跟「心愿单」按钮分离 — 心愿单是收藏(规划中),我的是社交活动
  const openMyPanel = useCallback(() => {
    setMyPanelOpen(true);
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
          {/* 发布 — 跟 / 和 /roommates 同款主 CTA;mobile 用 FAB,这里隐藏 */}
          <button
            onClick={() => setPostModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-chip hover:bg-brand-dark active:scale-95 transition-all text-sm font-medium whitespace-nowrap shadow-card"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>发布</span>
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 md:px-4 py-4">
        {/* Phase 3「问黑堡本地」chat 入口暂时隐藏 — RAG chatbot 上线时再放开 */}

        {/* === Phase 3B.3 Live 区:近 24h 活动顶部 sticky 区(空时不渲染) ===
            数据源 = 全部 events(LiveSection 内部过滤);只在筛选 chips 上方 */}
        {!loading && (
          <LiveSection
            events={events}
            onSeeAll={() => mainListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            onEditEvent={handleEditEvent}
            onDeleteEvent={handleDeleteEvent}
            onReportEvent={handleReportEvent}
          />
        )}

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

        {/* === 次筛选行:日期 + 地理 + 排序 ===
            注:不用 overflow-x-auto — 那会截断 absolute 定位的 dropdown 菜单。
            用 flex-wrap 让 dropdown 在窄屏自然换行,菜单弹出不受 overflow 限制 */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
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
          {/* 排序 dropdown — 默认状态按钮显「排序」(分类标签感),选了非默认显具体 label */}
          <FilterDropdown
            label={filters.sort === 'date' ? '排序' : SORTS.find(s => s.id === filters.sort)!.label}
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
        <div ref={mainListRef} className="scroll-mt-24">
          {loading ? (
            <SkeletonGrid />
          ) : visible.length === 0 ? (
            <EmptyState hasFilters={filters.dateRange !== 'all' || filters.locScope !== 'all' || !!q.trim()} cat={filters.cat} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
              {visible.map(e => (
                <EventCard
                  key={e.id}
                  event={e}
                  onEdit={handleEditEvent}
                  onDelete={handleDeleteEvent}
                  onReport={handleReportEvent}
                />
              ))}
            </div>
          )}
        </div>

        {/* 角注 */}
        <p className="text-xs text-stone-400 mt-8 text-center">
          每天早上 7 点自动更新 · 内容版权归各源站所有 · 点卡片展开看详情
        </p>
      </div>

      {/* Phase 3A.2 我的统一 panel — 跟二手/室友同一个 MyPostsPanel,默认选中"黑堡本地"tab */}
      {myPanelOpen && <MyPostsPanel onClose={() => setMyPanelOpen(false)} initialPlatform="event" />}

      {/* Phase 3A 发布 modal */}
      {postModalOpen && (
        <EventPostModal
          onClose={() => setPostModalOpen(false)}
          onCreated={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* Phase 3C: 编辑 modal — verify-code 通过后才打开 */}
      {editingInitial && (
        <EventPostModal
          initial={editingInitial}
          onClose={() => setEditingInitial(null)}
          onCreated={() => {
            setEditingInitial(null);
            setRefreshKey(k => k + 1);
          }}
        />
      )}

      {/* Phase 3C: 修改/删除前的密码 prompt */}
      {codePrompt && (
        <EditCodePrompt
          itemId={codePrompt.event.id}
          title={codePrompt.event.title}
          action={codePrompt.kind === 'edit' ? '修改' : '删除'}
          targetType="event"
          onCancel={() => setCodePrompt(null)}
          onConfirm={handleCodeConfirm}
        />
      )}

      {/* Mobile FAB — 跟 二手/室友 同款:首屏胶囊"发布",滚动后收圆+半透明 */}
      <FabPostButton
        onClick={() => setPostModalOpen(true)}
        label="发布"
        ariaLabel="发布活动"
      />

      {/* 回顶部按钮 — 滚动 > 400px 显;左下角半透明 */}
      <ScrollToTop />
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
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 点外关闭 — 用 ref.contains 判断而不是 data attr,避免不同 dropdown 互相干扰
  // pointerdown 比 mousedown 在 iOS 上更可靠
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent | MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative flex-shrink-0">
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
      <Leaf size={48} strokeWidth={1.5} className="mx-auto mb-4 text-stone-300" />
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
