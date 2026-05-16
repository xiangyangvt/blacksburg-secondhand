'use client';

// 本地活动心愿单入口按钮(Sprint 7 Phase 1.10)
// 跟 CartButton / SavedListingsPanel 触发按钮同款外壳:
//   - 40×40 圆 + brand 色实底(有内容时)/ 白底灰描边(空)
//   - 右上角红点 badge 显示数量
//   - 点击展开 EventWishlistPanel
// icon 用 CalendarHeartIcon —— 跟二手袋子+心、室友房子+心 形成"主体物+心"语法三件套

import { useEffect, useState } from 'react';
import { CalendarHeartIcon } from './CalendarHeartIcon';
import { getSavedEvents, subscribeSavedEvents } from '@/lib/savedEvents';
import { EventWishlistPanel } from './EventWishlistPanel';

export function EventWishlistButton({ className = '' }: { className?: string }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setCount(getSavedEvents().length);
    update();
    return subscribeSavedEvents(update);
  }, []);

  // 允许外部用 window event 打开(跟 CartButton 同款套路)
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('hb-open-event-wishlist', onOpen);
    return () => window.removeEventListener('hb-open-event-wishlist', onOpen);
  }, []);

  const hasItems = count > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`活动心愿单 ${hasItems ? `· ${count} 条` : ''}`}
        title="活动心愿单"
        className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full border transition-all shadow-card hover:shadow-card-hover active:scale-95 flex-shrink-0 ${
          hasItems
            ? 'bg-brand text-white border-brand hover:bg-brand-dark'
            : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
        } ${className}`}
      >
        <CalendarHeartIcon size={20} fill={hasItems} strokeWidth={1.8} />
        {hasItems && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow"
            aria-hidden
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && <EventWishlistPanel onClose={() => setOpen(false)} />}
    </>
  );
}
