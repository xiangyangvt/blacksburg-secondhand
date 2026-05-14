'use client';

// UX-13:同卖家其他物品曝光
// 用户点 ♡ 加入心愿单后,如果同卖家还有 ≥ 2 件其他 active 物品,
// 通过 sonner toast.custom 渲染富内容:已加入提示 + 同卖家其他物品缩略图 + "全部加入"按钮
//
// 心理学依据:
// - Self-Determination Theory(competence):"我聪明,一趟搞定多件"
// - 黑堡 WeChat-deal 文化先验:一次见面一锅端,一次能解决就一次
// - 意图形成后的低边际成本:L4 commitment 跨过后加件几乎无成本

import NextImage from 'next/image';
import { Heart, X, Package } from 'lucide-react';
import { toast } from 'sonner';
import { addToCart, isInCart } from '@/lib/shoppingCart';

export type SameSellerItem = {
  id: string;
  title: string;
  price: number | null;
  itemType: 'sell' | 'buy';
  category: string;
  photoUrls: string[];
  contactType: string;
  contactValue: string;
  customContactLabel: string | null;
};

/**
 * 触发 toast.custom 渲染同卖家曝光
 * - items 长度 < 2 → 不触发(交给调用者用普通 toast)
 * - items 长度 ≥ 2 → 渲染富内容 toast,持续 8s
 */
export function showSameSellerToast(items: SameSellerItem[]): boolean {
  if (items.length < 2) return false;
  toast.custom((t) => (
    <SameSellerCard items={items} onClose={() => toast.dismiss(t)} />
  ), { duration: 8000 });
  return true;
}

function SameSellerCard({ items, onClose }: { items: SameSellerItem[]; onClose: () => void }) {
  const itemToCartSnapshot = (it: SameSellerItem) => ({
    id: it.id,
    title: it.title,
    price: it.price,
    itemType: it.itemType,
    category: it.category,
    photoUrl: it.photoUrls[0] ?? null,
    contactType: it.contactType,
    contactValue: it.contactValue,
    customContactLabel: it.customContactLabel,
  });

  const addAll = () => {
    let added = 0;
    for (const it of items) {
      if (isInCart(it.id)) continue;
      const ret = addToCart(itemToCartSnapshot(it));
      if (ret === true) added++;
      if (ret === 'full') break;
    }
    onClose();
    if (added > 0) {
      toast.success(`已一并加入 ${added} 件`);
    }
  };

  const addOne = (it: SameSellerItem) => {
    if (isInCart(it.id)) return;
    addToCart(itemToCartSnapshot(it));
  };

  return (
    <div className="bg-white rounded-card shadow-overlay p-3 w-[360px] max-w-[calc(100vw-2rem)] sm:w-[420px] border border-stone-200">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-stone-900 font-medium text-sm">
          <Heart size={14} fill="currentColor" className="text-brand" />
          已加入心愿单
        </div>
        <button
          onClick={onClose}
          aria-label="关闭"
          className="text-stone-400 hover:text-stone-700 p-1 -m-1 rounded-full hover:bg-stone-100"
        >
          <X size={14} />
        </button>
      </div>
      <div className="text-xs text-stone-600 mb-2.5">
        此卖家还有 <strong>{items.length}</strong> 件 · 一起加入省一趟见面
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {items.slice(0, 4).map(it => (
          <button
            key={it.id}
            onClick={() => addOne(it)}
            className="relative aspect-square rounded overflow-hidden bg-stone-100 hover:opacity-90 active:scale-95 transition-transform group"
            title={`${it.title} - $${it.price ?? '面议'} (点击加入)`}
          >
            {it.photoUrls[0] ? (
              <NextImage
                src={it.photoUrls[0]}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-300">
                <Package size={20} strokeWidth={1.2} />
              </div>
            )}
            <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[10px] px-1 rounded font-medium">
              {it.price === null ? '面议' : `$${it.price}`}
            </span>
            <span className="absolute top-0.5 right-0.5 bg-white/90 text-brand p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <Heart size={10} strokeWidth={2.5} />
            </span>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={addAll}
          className="flex-1 px-3 py-1.5 bg-brand text-white rounded-chip text-sm font-medium hover:bg-brand-dark active:scale-95 transition-all shadow-card"
        >
          全部加入 ({items.length})
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 border border-stone-300 text-stone-700 rounded-chip text-sm hover:bg-stone-100 active:scale-95 transition-all"
        >
          跳过
        </button>
      </div>
    </div>
  );
}
