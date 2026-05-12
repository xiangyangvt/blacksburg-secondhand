'use client';

// "你最近看过的" — listing 版
// 触发记录的时机：
//   - 点击 ListingCard 展开（明确的兴趣信号）
//   - 点"申请联系"按钮（更强的兴趣信号）

import { useEffect, useState } from 'react';
import NextImage from 'next/image';
import { Clock, X } from 'lucide-react';
import type { Listing } from './ListingCard';
import { LISTING_TYPES } from '@/lib/utils';
import { toCloudinaryThumb } from '@/lib/cloudinary';
import { getRecentViewIds, clearRecentViews, removeRecentView } from '@/lib/recentViews';

export function RecentListingStrip({ listings }: { listings: Listing[] }) {
  const [ids, setIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const list = getRecentViewIds('listing');
    const activeIds = new Set(listings.map(l => l.id));
    list.forEach(id => { if (!activeIds.has(id)) removeRecentView(id, 'listing'); });
    setIds(getRecentViewIds('listing'));
  }, [listings]);

  if (!mounted || ids.length === 0) return null;

  const map = new Map(listings.map(l => [l.id, l]));
  const recents = ids.map(id => map.get(id)).filter((x): x is Listing => !!x);
  if (recents.length === 0) return null;

  const onClickThumb = (id: string) => {
    const el = document.querySelector(`[data-listing-id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const onClear = () => {
    if (!confirm('清空最近浏览记录？')) return;
    clearRecentViews('listing');
    setIds([]);
  };

  return (
    <section className="mb-3 md:mb-4">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <h2 className="text-xs font-medium text-stone-500 flex items-center gap-1">
          <Clock size={12} />
          你最近看过的
        </h2>
        <button
          onClick={onClear}
          className="text-xs text-stone-400 hover:text-stone-700 px-2 py-0.5 rounded hover:bg-stone-100 inline-flex items-center gap-0.5"
        >
          <X size={11} />
          清空
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 pb-1">
        {recents.map(listing => {
          const thumb = listing.photoUrls[0]
            ? toCloudinaryThumb(listing.photoUrls[0], 160, 'auto')
            : null;
          const typeMeta = LISTING_TYPES.find(t => t.id === listing.type);
          return (
            <button
              key={listing.id}
              onClick={() => onClickThumb(listing.id)}
              className="flex-shrink-0 w-20 group text-left"
              aria-label={`滚到: ${listing.title}`}
            >
              <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-stone-100 border border-stone-200 group-hover:border-brand transition-colors">
                {thumb ? (
                  <NextImage src={thumb} alt="" fill sizes="80px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-300 text-2xl">🏠</div>
                )}
              </div>
              <div className="text-[10px] text-stone-700 mt-1 truncate" title={listing.title}>
                {listing.title}
              </div>
              <div className="text-[10px] text-stone-500 truncate">
                {typeMeta?.label ?? listing.type}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
