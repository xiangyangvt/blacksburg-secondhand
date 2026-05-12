'use client';

// 购物车入口按钮 —— 固定在筛选条最右侧的"墙"
// 空时白底低调，有货时变 brand 红主动吸睛；右上数字徽角

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { getCart, subscribeCart } from '@/lib/shoppingCart';

export function CartButton({ className = '' }: { className?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(getCart().length);
    update();
    return subscribeCart(update);
  }, []);

  const hasItems = count > 0;

  return (
    <Link
      href="/cart"
      aria-label={`购物清单 ${count > 0 ? `· ${count} 件` : ''}`}
      className={`relative inline-flex items-center justify-center w-10 h-10 rounded-full border transition-all shadow-card hover:shadow-card-hover active:scale-95 ${
        hasItems
          ? 'bg-brand text-white border-brand hover:bg-brand-dark'
          : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
      } ${className}`}
    >
      <ShoppingBag size={18} strokeWidth={2.2} />
      {hasItems && (
        <span
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow"
          aria-hidden
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
