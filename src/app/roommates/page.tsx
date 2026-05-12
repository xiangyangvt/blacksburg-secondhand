'use client';

// /roommates 主页 — Sprint 4 L6（满）
// L6 后半：filter chip 行（URL query 同步）+ ListingCard 双态

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, PackageOpen, Construction } from 'lucide-react';
import { ListingCard, type Listing } from '@/components/ListingCard';
import { RecentListingStrip } from '@/components/RecentListingStrip';
import { PlatformSwitcher } from '@/components/PlatformSwitcher';
import { MyPostsPanel } from '@/components/MyPostsPanel';
import { ListingPostModal } from '@/components/ListingPostModal';
import { ListingApplyModal } from '@/components/ListingApplyModal';
import {
  ListingFilterBar,
  LISTING_FILTERS_DEFAULT,
  type ListingFilters,
} from '@/components/ListingFilterBar';
import { FabPostButton } from '@/components/FabPostButton';
import { ScrollToTop } from '@/components/ScrollToTop';
import { captureUtmFromUrl } from '@/lib/utm';

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

  const [filters, setFilters] = useState<ListingFilters>(LISTING_FILTERS_DEFAULT);

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

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <PlatformSwitcher />
          <div className="flex-1" />
          <button
            onClick={() => setMyPanelOpen(true)}
            className="px-3 sm:px-4 py-2 rounded-chip text-sm font-medium whitespace-nowrap bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors"
          >
            我的发布
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

        {/* 最近浏览：仅有历史 + listings 不空时显示 */}
        {!loading && listings.length > 0 && <RecentListingStrip listings={listings} />}

        {loading ? (
          <SkeletonGrid />
        ) : listings.length === 0 ? (
          <div className="text-center text-stone-500 py-20">
            <PackageOpen size={56} strokeWidth={1.2} className="mx-auto mb-4 text-stone-300" />
            <div className="mb-3">这里还没有匹配的 listing</div>
            <button
              onClick={onPost}
              className="text-brand underline hover:text-brand-dark"
            >
              做第一个发布的人 →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
            {listings.map(l => (
              <ListingCard key={l.id} listing={l} onApply={onApply} />
            ))}
          </div>
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
