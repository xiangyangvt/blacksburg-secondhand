'use client';

// /roommates 主页 — Sprint 4 L6（半）
// 这一版仅列表 + ListingCard，没接 filter chip 也没 detail 页和申请 modal
// L7 / L8 / 后续会补全

import { useState, useEffect, useCallback } from 'react';
import { Plus, PackageOpen, Construction } from 'lucide-react';
import { ListingCard, type Listing } from '@/components/ListingCard';
import { PlatformSwitcher } from '@/components/PlatformSwitcher';
import { MyPostsPanel } from '@/components/MyPostsPanel';
import { captureUtmFromUrl } from '@/lib/utm';

export default function RoommatesPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [myPanelOpen, setMyPanelOpen] = useState(false);

  useEffect(() => { captureUtmFromUrl(); }, []);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/listings?sort=newest');
      const data = await res.json();
      setListings(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  // L8 还没做，先用 alert 占位
  const onApply = (l: Listing) => {
    alert(`申请联系: ${l.title}\n\nL8 申请 modal 即将上线`);
  };
  const onPost = () => {
    alert('发布 listing 即将上线（L7 表单）');
  };

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

        {loading ? (
          <SkeletonGrid />
        ) : listings.length === 0 ? (
          <div className="text-center text-stone-500 py-20">
            <PackageOpen size={56} strokeWidth={1.2} className="mx-auto mb-4 text-stone-300" />
            <div className="mb-3">这里还没有 listing</div>
            <button
              onClick={onPost}
              className="text-brand underline hover:text-brand-dark"
            >
              做第一个发布的人 →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {listings.map(l => (
              <ListingCard key={l.id} listing={l} onApply={onApply} />
            ))}
          </div>
        )}
      </div>

      {myPanelOpen && (
        <MyPostsPanel onClose={() => setMyPanelOpen(false)} />
      )}
    </main>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
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
