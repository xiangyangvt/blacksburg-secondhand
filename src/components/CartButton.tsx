'use client';

// 心愿单入口按钮(Sprint 6.6 重设计)
// - 图标:ShoppingBag(购物袋) + Heart(心)复合,语义更明确"装着心愿"
//   单独 ♥ 用户读为"喜欢/收藏",bag+heart 直觉就是"心愿购物袋"
// - 放在 header 而不是筛选条 —— 全站可见 + 二手/室友切换不挪位置
// - 监听全局事件 hb-open-cart 让 /cart 旧路由 redirect 进来时能打开

import { useEffect, useState } from 'react';
import { ShoppingBag, Heart } from 'lucide-react';
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
        title="心愿单"
        className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full border transition-all shadow-card hover:shadow-card-hover active:scale-95 flex-shrink-0 ${
          hasItems
            ? 'bg-brand text-white border-brand hover:bg-brand-dark'
            : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
        } ${className}`}
      >
        {/* 复合图标:袋子轮廓 + 内嵌心 */}
        <span className="relative inline-flex items-center justify-center" aria-hidden>
          <ShoppingBag size={20} strokeWidth={1.8} />
          <Heart
            size={10}
            strokeWidth={2.5}
            fill="currentColor"
            className="absolute"
            style={{ top: '58%', left: '50%', transform: 'translate(-50%, -50%)' }}
          />
        </span>
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
