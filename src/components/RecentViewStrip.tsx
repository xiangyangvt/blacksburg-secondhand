'use client';

// "最近浏览" 横向滚动 strip
// - 仅在用户有浏览历史时显示
// - 点击缩略图：滚到主页 feed 里那张卡片
// - "清空"按钮：擦 localStorage
// - 失效条目（已下架/删除）自动从 strip 清

import { useEffect, useState } from 'react';
import NextImage from 'next/image';
import { Clock, X } from 'lucide-react';
import type { Item } from './ItemCard';
import { formatPrice } from '@/lib/utils';
import { toCloudinaryThumb } from '@/lib/cloudinary';
import { getRecentViewIds, clearRecentViews, removeRecentView } from '@/lib/recentViews';
import { useT, useLocale } from '@/i18n/I18nProvider';

export function RecentViewStrip({ items }: { items: Item[] }) {
  const t = useT();
  const locale = useLocale();
  const [ids, setIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  // 客户端挂载后读 localStorage（避免 SSR hydration mismatch）
  useEffect(() => {
    setMounted(true);
    const list = getRecentViewIds();
    // 同步清掉已经不在主 feed 里的（被删 / 下架的）
    const activeIds = new Set(items.map(it => it.id));
    list.forEach(id => { if (!activeIds.has(id)) removeRecentView(id); });
    setIds(getRecentViewIds());
  }, [items]);

  if (!mounted || ids.length === 0) return null;

  // 把 ids 映射回 Item 对象，保留 ids 的顺序
  const itemMap = new Map(items.map(it => [it.id, it]));
  const recents = ids
    .map(id => itemMap.get(id))
    .filter((x): x is Item => !!x);

  if (recents.length === 0) return null;

  const onClickThumb = (id: string) => {
    // 滚到主 feed 中那张卡片
    const el = document.querySelector(`[data-item-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const onClear = () => {
    if (!confirm('清空最近浏览记录？')) return;
    clearRecentViews();
    setIds([]);
  };

  return (
    <section className="mb-3 md:mb-4">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <h2 className="text-xs font-medium text-stone-500 flex items-center gap-1">
          <Clock size={12} />
          {t('list.recentTitle').replace(/^🕒\s*/, '')}
        </h2>
        <button
          onClick={onClear}
          className="text-xs text-stone-400 hover:text-stone-700 px-2 py-0.5 rounded hover:bg-stone-100 inline-flex items-center gap-0.5"
        >
          <X size={11} />
          {t('list.recentClear')}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 pb-1">
        {recents.map(item => {
          const thumb = item.photoUrls[0]
            ? toCloudinaryThumb(item.photoUrls[0], 160, 'auto')
            : null;
          return (
            <button
              key={item.id}
              onClick={() => onClickThumb(item.id)}
              className="flex-shrink-0 w-20 group text-left"
              aria-label={`滚到商品: ${item.title}`}
            >
              <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-stone-100 border border-stone-200 group-hover:border-brand transition-colors">
                {thumb ? (
                  <NextImage
                    src={thumb}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-300 text-2xl">
                    📦
                  </div>
                )}
              </div>
              <div className="text-[10px] text-stone-700 mt-1 truncate" title={item.title}>
                {item.title}
              </div>
              <div className="text-[10px] font-semibold text-brand truncate">
                {formatPrice(item.price, locale, item.type, item.category)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
