'use client';

// /roommates 主页 — Sprint 4 L6（满）
// L6 后半：filter chip 行（URL query 同步）+ ListingCard 双态

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, PackageOpen, Construction } from 'lucide-react';
import { ListingCard, type Listing } from '@/components/ListingCard';
import { RecentListingStrip } from '@/components/RecentListingStrip';
import { PlatformTabs } from '@/components/PlatformTabs';
import { SearchBox } from '@/components/SearchBox';
import { MyPostsPanel } from '@/components/MyPostsPanel';
import { ListingPostModal, type ListingEditInitial } from '@/components/ListingPostModal';
import { ListingApplyModal } from '@/components/ListingApplyModal';
import { EditCodePrompt } from '@/components/EditCodePrompt';
import {
  ListingFilterBar,
  LISTING_FILTERS_DEFAULT,
  type ListingFilters,
} from '@/components/ListingFilterBar';
import { FabPostButton } from '@/components/FabPostButton';
import { ScrollToTop } from '@/components/ScrollToTop';
import { captureUtmFromUrl } from '@/lib/utm';
import { useUnreadCount, markSeen } from '@/lib/notifications';
import { showError, showSuccess } from '@/lib/toast';
import { groupByMatch } from '@/lib/listingMatch';

function parseFiltersFromQuery(sp: URLSearchParams): ListingFilters {
  return {
    type:        sp.get('type')        ?? 'all',
    canApplyAs:  (sp.get('canApplyAs') as ListingFilters['canApplyAs']) ?? 'any',
    areas:       sp.get('areas')?.split(',').filter(Boolean) ?? [],
    budgetMin:   sp.get('budgetMin')   ?? '',
    budgetMax:   sp.get('budgetMax')   ?? '',
    sort:        (sp.get('sort') as ListingFilters['sort']) ?? 'newest',
  };
}

function filtersToQuery(f: ListingFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.type !== 'all')         sp.set('type', f.type);
  if (f.canApplyAs !== 'any')   sp.set('canApplyAs', f.canApplyAs);
  if (f.areas.length > 0)       sp.set('areas', f.areas.join(','));
  if (f.budgetMin)              sp.set('budgetMin', f.budgetMin);
  if (f.budgetMax)              sp.set('budgetMax', f.budgetMax);
  if (f.sort !== 'newest')      sp.set('sort', f.sort);
  return sp;
}

// Next.js 要求：用了 useSearchParams() 的组件必须包在 <Suspense> 里才能预渲染
export default function RoommatesPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen">
        <div className="max-w-6xl mx-auto px-3 md:px-4 py-4">
          <SkeletonGrid />
        </div>
      </main>
    }>
      <RoommatesContent />
    </Suspense>
  );
}

function RoommatesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [myPanelOpen, setMyPanelOpen] = useState(false);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [applyTarget, setApplyTarget] = useState<Listing | null>(null);

  // 编辑 / 删除 / 举报 三种动作都要识别码先验证
  const [codePrompt, setCodePrompt] = useState<
    | { kind: 'edit';   listing: Listing }
    | { kind: 'delete'; listing: Listing }
    | null
  >(null);
  const [editTarget, setEditTarget] = useState<{ listing: ListingEditInitial; editCode: string } | null>(null);

  const [filters, setFilters] = useState<ListingFilters>(LISTING_FILTERS_DEFAULT);

  // Sprint 6.6:加搜索 q,客户端 filter listing.title / description
  const [q, setQ] = useState('');

  // 客户端搜索过滤(在 server filter 后再做一次 q 匹配)
  const searchFilteredListings = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return listings;
    return listings.filter(l =>
      (l.title ?? '').toLowerCase().includes(ql) ||
      (l.description ?? '').toLowerCase().includes(ql)
    );
  }, [listings, q]);

  // 通知 badge：未读 application / 状态变化
  const unreadListings = useUnreadCount('listing');

  // 分享链接 /roommates?focus=ID：mount 时一次性读 URL
  const [focusId] = useState<string | null>(() => searchParams?.get('focus') ?? null);
  const focusFound = !!focusId && listings.some(l => l.id === focusId);
  const focusMissing = !!focusId && !loading && listings.length > 0 && !focusFound;

  useEffect(() => { captureUtmFromUrl(); }, []);

  // 初次挂载：从 URL 读 filter（仅一次，后续 filter 修改 → URL）
  useEffect(() => {
    setFilters(parseFiltersFromQuery(new URLSearchParams(searchParams?.toString() ?? '')));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchListings = useCallback(async (f: ListingFilters) => {
    setLoading(true);
    try {
      const sp = filtersToQuery(f);
      if (!sp.has('sort')) sp.set('sort', 'newest');  // 兜底
      const res = await fetch(`/api/listings?${sp.toString()}`);
      const data = await res.json();
      setListings(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchListings(filters); }, [filters, fetchListings]);

  const onFilterChange = (next: Partial<ListingFilters>) => {
    const merged = { ...filters, ...next };
    setFilters(merged);
    // 同步 URL（不刷新页面）
    const sp = filtersToQuery(merged);
    const qs = sp.toString();
    router.replace(qs ? `/roommates?${qs}` : '/roommates', { scroll: false });
  };

  const onApply = (l: Listing) => setApplyTarget(l);
  const onPost = () => setPostModalOpen(true);

  // === 编辑：先识别码验证 → 打开 ListingPostModal edit mode ===
  const onEditListing = (l: Listing) => setCodePrompt({ kind: 'edit', listing: l });

  const handleEditConfirm = async (code: string) => {
    if (!codePrompt || codePrompt.kind !== 'edit') return;
    // 先验证识别码 —— 错码不让进编辑界面（避免用户填一堆才被告知失败）
    const res = await fetch(`/api/listings/${codePrompt.listing.id}/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCode: code }),
    });
    const data = await res.json();
    if (!res.ok || !data.valid) {
      showError(data.error || '识别码错误');
      return; // 留在 EditCodePrompt，让用户重试
    }
    // 通过 → 用 GET 不能拿 contactValue（公开 API 擦了）；从 localStorage 取（卖家本人会有）
    let contactValue = '';
    try { contactValue = localStorage.getItem('hb_my_contact_value') ?? ''; } catch {}
    setEditTarget({
      listing: { ...codePrompt.listing, contactValue } as ListingEditInitial,
      editCode: code,
    });
    setCodePrompt(null);
  };

  // === 删除：先识别码验证 → DELETE 调用 ===
  const onDeleteListing = (l: Listing) => setCodePrompt({ kind: 'delete', listing: l });

  const handleDeleteConfirm = async (code: string) => {
    if (!codePrompt || codePrompt.kind !== 'delete') return;
    // 先验证识别码（错码不弹"确认删除"骚扰用户）
    const v = await fetch(`/api/listings/${codePrompt.listing.id}/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCode: code }),
    });
    const vData = await v.json();
    if (!v.ok || !vData.valid) {
      showError(vData.error || '识别码错误');
      return;
    }
    if (!confirm('删除后无法恢复，确定？')) return;
    const id = codePrompt.listing.id;
    const res = await fetch(`/api/listings/${id}?editCode=${encodeURIComponent(code)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { showError(data.error || '删除失败'); return; }
    setCodePrompt(null);
    fetchListings(filters);
  };

  // === 举报：弹出 reason 输入 → POST /api/reports ===
  const onReportListing = async (l: Listing) => {
    const reason = prompt('举报理由（可空，会汇总到管理后台；累计 3 个不同 IP 自动隐藏）');
    if (reason === null) return;
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'listing', targetId: l.id, reason }),
    });
    if (res.ok) showSuccess('已收到举报，谢谢');
    else showError('举报失败，请稍后再试');
  };

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
          <PlatformTabs />

          {/* 搜索 — 跟 / 主页同款,Sprint 6.6 加上 */}
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="搜索室友 listing"
          />

          {/* spacer 桌面把右侧按钮推到右边 */}
          <div className="flex-1 hidden md:block" />
          <button
            onClick={() => {
              setMyPanelOpen(true);
              markSeen('listing');
            }}
            className="relative px-3 sm:px-4 py-2 rounded-chip text-sm font-medium whitespace-nowrap bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors"
          >
            我的
            {unreadListings > 0 && !myPanelOpen && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                {unreadListings > 9 ? '9+' : unreadListings}
              </span>
            )}
          </button>
          <button
            onClick={onPost}
            className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-chip hover:bg-brand-dark active:scale-95 transition-all text-sm font-medium whitespace-nowrap shadow-card"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>发布</span>
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 md:px-4 py-4">
        {/* 早期 disclaimer：法律 + 平台中立 */}
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
          <Construction size={14} className="flex-shrink-0 mt-0.5" />
          <div>
            <strong>仅信息发布平台</strong> · 租赁 / 转租具体条款由双方自行协商，与本站无关。
            性别筛选基于发帖人自我表达，未经第三方验证。
          </div>
        </div>

        {/* Filter chip 行 */}
        <div className="mb-3">
          <ListingFilterBar filters={filters} onChange={onFilterChange} />
        </div>

        {/* focus 命中失败提示（?focus=ID 但 listing 已下架/被筛掉） */}
        {focusMissing && (
          <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            你访问的 listing 可能已下架 / 已匹配，下面是其他在租 listing。
          </div>
        )}

        {/* 最近浏览：仅有历史 + listings 不空时显示 */}
        {!loading && listings.length > 0 && <RecentListingStrip listings={listings} />}

        {loading ? (
          <SkeletonGrid />
        ) : searchFilteredListings.length === 0 ? (
          <div className="text-center text-stone-500 py-20">
            <PackageOpen size={56} strokeWidth={1.2} className="mx-auto mb-4 text-stone-300" />
            <div className="mb-3">
              {q.trim() ? `没有找到包含「${q.trim()}」的 listing` : '这里还没有匹配的 listing'}
            </div>
            <button
              onClick={onPost}
              className="text-brand underline hover:text-brand-dark"
            >
              做第一个发布的人 →
            </button>
          </div>
        ) : (
          <GroupedListings
            filters={filters}
            listings={searchFilteredListings}
            focusId={focusId}
            onApply={onApply}
            onEditListing={onEditListing}
            onDeleteListing={onDeleteListing}
            onReportListing={onReportListing}
          />
        )}
      </div>

      {myPanelOpen && (
        <MyPostsPanel onClose={() => setMyPanelOpen(false)} />
      )}

      {postModalOpen && (
        <ListingPostModal
          onClose={() => setPostModalOpen(false)}
          onSaved={() => fetchListings(filters)}
        />
      )}

      {applyTarget && (
        <ListingApplyModal
          listing={applyTarget}
          onClose={() => setApplyTarget(null)}
          onSent={() => fetchListings(filters)}
        />
      )}

      {/* 编辑 / 删除：识别码验证 */}
      {codePrompt && (
        <EditCodePrompt
          itemId={codePrompt.listing.id}
          title={codePrompt.listing.title}
          action={codePrompt.kind === 'edit' ? '编辑' : '删除'}
          targetType="listing"
          onCancel={() => setCodePrompt(null)}
          onConfirm={codePrompt.kind === 'edit' ? handleEditConfirm : handleDeleteConfirm}
        />
      )}

      {/* 编辑模态：识别码通过后打开 */}
      {editTarget && (
        <ListingPostModal
          mode="edit"
          initialListing={editTarget.listing}
          initialEditCode={editTarget.editCode}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); fetchListings(filters); }}
        />
      )}

      {/* 手机端浮动发布按钮 — 跟二手对齐 */}
      <FabPostButton onClick={onPost} label="发布" ariaLabel="发布 listing" />

      {/* 浮动回顶部按钮（滚动 >400px 才出现） */}
      <ScrollToTop />
    </main>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white rounded-card border border-stone-200 p-4 animate-pulse">
          <div className="aspect-[4/3] bg-stone-100 rounded mb-3" />
          <div className="h-5 bg-stone-200 rounded w-1/2 mb-2" />
          <div className="h-6 bg-stone-200 rounded w-1/3 mb-2" />
          <div className="h-4 bg-stone-100 rounded w-3/4" />
        </div>
      ))}
    </div>
  );
}

// UX-10:按 matchScore 分组渲染。完全/部分 默认展开,其它默认折叠
function GroupedListings({
  filters,
  listings,
  focusId,
  onApply,
  onEditListing,
  onDeleteListing,
  onReportListing,
}: {
  filters: ListingFilters;
  listings: Listing[];
  focusId: string | null;
  onApply: (l: Listing) => void;
  onEditListing: (l: Listing) => void;
  onDeleteListing: (l: Listing) => void;
  onReportListing: (l: Listing) => Promise<void> | void;
}) {
  const groups = useMemo(() => groupByMatch(filters, listings), [filters, listings]);
  const [otherOpen, setOtherOpen] = useState(false);

  // 用户没选 filter → 全部 full,不显示分组 header(回到普通列表)
  const noFilter =
    filters.canApplyAs === 'any' &&
    filters.areas.length === 0;

  // 只渲染 full(没分组)
  if (noFilter) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
        {groups.full.map(r => (
          <ListingCard
            key={r.listing.id}
            listing={r.listing}
            autoExpand={r.listing.id === focusId}
            onApply={onApply}
            onEdit={onEditListing}
            onDelete={onDeleteListing}
            onReport={onReportListing}
          />
        ))}
      </div>
    );
  }

  const renderSection = (title: string, results: typeof groups.full, defaultOpen: boolean) => {
    if (results.length === 0) return null;
    return (
      <section className="mb-5">
        <h2 className="text-xs font-medium text-stone-500 mb-2 px-1">
          {title} · <span className="text-stone-400">{results.length} 条</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
          {results.map(r => (
            <ListingCard
              key={r.listing.id}
              listing={r.listing}
              autoExpand={r.listing.id === focusId}
              onApply={onApply}
              onEdit={onEditListing}
              onDelete={onDeleteListing}
              onReport={onReportListing}
            />
          ))}
        </div>
      </section>
    );
  };

  return (
    <>
      <div className="text-xs text-stone-500 mb-3 px-1">
        💡 chip 是排序参考,差一点的也会显示,不会硬过滤
      </div>
      {renderSection('完全匹配', groups.full, true)}
      {renderSection('部分匹配', groups.partial, true)}
      {groups.other.length > 0 && (
        <section className="mb-5">
          <button
            onClick={() => setOtherOpen(v => !v)}
            className="text-xs font-medium text-stone-500 hover:text-stone-900 mb-2 px-1 flex items-center gap-1 transition-colors"
          >
            <span>其他(差距较大)· <span className="text-stone-400">{groups.other.length} 条</span></span>
            <span className={`inline-block transition-transform ${otherOpen ? 'rotate-90' : ''}`}>▶</span>
          </button>
          {otherOpen && (
            <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
              {groups.other.map(r => (
                <ListingCard
                  key={r.listing.id}
                  listing={r.listing}
                  autoExpand={r.listing.id === focusId}
                  onApply={onApply}
                  onEdit={onEditListing}
                  onDelete={onDeleteListing}
                  onReport={onReportListing}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
