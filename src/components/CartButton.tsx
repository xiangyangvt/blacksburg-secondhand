'use client';

// 心愿单入口按钮(Sprint 6.7 第二版)
// - 自定义 SVG:购物袋(有明显的两个手柄环)+ 内嵌实心 ♥
//   ▸ lucide ShoppingBag 手柄是单弧线,小尺寸下读不出"袋"感(像箱子)
//   ▸ 自绘双手柄环 + 梯形袋身,语义一眼读懂
// - 位置回到筛选侧(Sprint 6.6 搬到 header 被 Sean 反对 → 撤回)

import { useEffect, useState } from 'react';
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
        {/* 自定义购物袋 + 心 复合 SVG */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="20"
          height="20"
          aria-hidden
        >
          {/* 袋身:稍微梯形,底部略宽 */}
          <path d="M5 8 L4 20.5 a1.5 1.5 0 0 0 1.5 1.5 h13 a1.5 1.5 0 0 0 1.5 -1.5 L19 8 Z" />
          {/* 两个手柄:左右各一个独立的环,上端汇合形成"两条肩带"的视觉 */}
          <path d="M8.5 8 V5.5 a3.5 3.5 0 0 1 7 0 V8" />
          {/* 袋身横线(顶口加固线,增加"袋子"质感) */}
          <line x1="4.5" y1="8" x2="19.5" y2="8" />
          {/* 内嵌心:实心,放袋身中央 */}
          <path
            d="M12 17.5 C 10 16 8.8 14.7 8.8 13.4 C 8.8 12.4 9.5 11.6 10.4 11.6 C 11.1 11.6 11.6 12 12 12.5 C 12.4 12 12.9 11.6 13.6 11.6 C 14.5 11.6 15.2 12.4 15.2 13.4 C 15.2 14.7 14 16 12 17.5 Z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
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
