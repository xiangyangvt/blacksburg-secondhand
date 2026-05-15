'use client';

// UX-13:同卖家其他物品曝光(Sprint 6.7g 改造)
// 用户点 ♡ 加入心愿单后,如果同卖家还有 ≥ 2 件其他 active 物品,
// 通过 sonner toast.custom 渲染富内容
//
// Sprint 6.7g 行为调整:
//   - 主按钮 "去看看 (N)" → 跳 /?seller=X 用 seller 过滤显示该卖家所有商品
//   - 缩略图点击 → 跳 /?focus=ID 直接看那个商品(关闭 toast)
//   - 不再就地加入(避免不可逆动作)

import { useRouter } from 'next/navigation';
import NextImage from 'next/image';
import { Heart, X, Package } from 'lucide-react';
import { toast } from 'sonner';

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

export function showSameSellerToast(items: SameSellerItem[]): boolean {
  // Sprint 6.7h:门槛从 ≥2 降到 ≥1(总数 >1 即触发)
  if (items.length < 1) return false;
  toast.custom((t) => (
    <SameSellerCard items={items} onClose={() => toast.dismiss(t)} />
  ), { duration: 8000 });
  return true;
}

function SameSellerCard({ items, onClose }: { items: SameSellerItem[]; onClose: () => void }) {
  const router = useRouter();
  const contactValue = items[0]?.contactValue ?? '';

  const goCheckAll = () => {
    onClose();
    if (contactValue) {
      router.push(`/?seller=${encodeURIComponent(contactValue)}`);
    }
  };

  const goItem = (id: string) => {
    onClose();
    router.push(`/?focus=${id}`);
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
      <div className="text-xs text-stone-600 mb-2">
        此卖家还有 <strong>{items.length}</strong> 件 · 点缩略图直接看,或一起浏览省一趟见面
      </div>
      {/* 横向滚动条:展示全部物品,而不是只 4 个 */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1.5 -mx-3 px-3 scrollbar-thin">
        {items.map(it => (
          <button
            key={it.id}
            onClick={() => goItem(it.id)}
            className="relative w-20 h-20 flex-shrink-0 rounded overflow-hidden bg-stone-100 hover:opacity-90 active:scale-95 transition-transform"
            title={`${it.title} - $${it.price ?? '面议'}(点击查看)`}
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
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={goCheckAll}
          className="flex-1 px-3 py-1.5 bg-brand text-white rounded-chip text-sm font-medium hover:bg-brand-dark active:scale-95 transition-all shadow-card"
        >
          去看看 ({items.length})
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
