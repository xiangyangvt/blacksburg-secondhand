'use client';

// 心愿单入口按钮 —— 固定在筛选条最右侧的"墙"
// 点击呼出 ShoppingCartPanel（悬浮 modal，跟 MyPostsPanel 一个套路），不再跳路由
// 同时监听全局事件 hb-open-cart：其它地方（如 /cart 旧链接落地）可触发同一个 panel
// 注：事件名保留 hb-open-cart 是为了向后兼容，不破坏 /cart 旧落地

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { getCart, subscribeCart } from '@/lib/shoppingCart';
import { ShoppingCartPanel } from './ShoppingCartPanel';

export function CartButton({ className = '' }: { className?: string }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const update = () => setCount(getCart().length);
    update();
    return subscribeCart(update);
  }, []);

  // 监听全局事件让其它入口（/cart 路由 fallback 等）能打开同一个 panel
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('hb-open-cart', onOpen);
    return () => window.removeEventListener('hb-open-cart', onOpen);
  }, []);

  const hasItems = count > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`心愿单 ${hasItems ? `· ${count} 件` : ''}`}
        className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full border transition-all shadow-card hover:shadow-card-hover active:scale-95 ${
          hasItems
            ? 'bg-brand text-white border-brand hover:bg-brand-dark'
            : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
        } ${className}`}
      >
        <Heart size={18} strokeWidth={2.2} fill={hasItems ? 'currentColor' : 'none'} />
        {hasItems && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow"
            aria-hidden
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && <ShoppingCartPanel onClose={() => setOpen(false)} />}
    </>
  );
}
