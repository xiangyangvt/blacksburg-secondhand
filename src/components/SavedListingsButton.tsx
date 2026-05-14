'use client';

// 室友 listing 心愿单入口按钮(Sprint 6.7)
// - 跟 CartButton 平行,但服务 listings 而不是 items
// - 图标:纯 Heart(listing 没"袋子"语义,只是 bookmark/favorite)
// - 放 ListingFilterBar 右侧

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { getSavedListings, subscribeSavedListings } from '@/lib/savedListings';
import { SavedListingsPanel } from './SavedListingsPanel';

export function SavedListingsButton({ className = '' }: { className?: string }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setCount(getSavedListings().length);
    update();
    return subscribeSavedListings(update);
  }, []);

  const has = count > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`室友心愿单 ${has ? `· ${count} 条` : ''}`}
        title="室友心愿单"
        className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full border transition-all shadow-card hover:shadow-card-hover active:scale-95 flex-shrink-0 ${
          has
            ? 'bg-brand text-white border-brand hover:bg-brand-dark'
            : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
        } ${className}`}
      >
        <Heart size={18} strokeWidth={2} fill={has ? 'currentColor' : 'none'} />
        {has && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow"
            aria-hidden
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && <SavedListingsPanel onClose={() => setOpen(false)} />}
    </>
  );
}
