'use client';

// Sprint 11A / 11B:卖家筛选之后的延伸 —— 「和这些相似的」+「全站其他在售」
//
// 扫长图二维码进站的人是来看某位卖家的东西的;看完之后页面不该到底。这里把列表顺着接下去:
//   1. 相似的:GET /api/items/similar(以卖家物品已存的向量为引子,零费用;向量不可用时服务端兜底同类目)
//   2. 全站其他在售:GET /api/items(不带卖家筛选),去掉已经出现过的
// 两段都用主页同款 ItemCard,展开 / 询价 / 购物车行为一致。任何一段失败或为空就不渲染,不影响上面的卖家列表。

import { useEffect, useState } from 'react';
import { ItemCard, type Item } from '@/components/ItemCard';
import { useT } from '@/i18n/I18nProvider';

type CardProps = Omit<Parameters<typeof ItemCard>[0], 'item' | 'badge' | 'autoExpand'>;

const MORE_LIMIT = 40;

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <div className="flex-1 border-t border-stone-200" />
      <span className="text-xs font-medium text-stone-600 whitespace-nowrap">{label}</span>
      <div className="flex-1 border-t border-stone-200" />
    </div>
  );
}

export function SellerExplore({
  seller,
  excludeIds,
  cardProps,
}: {
  seller: { key: 'shelf' | 'sameSellerAs'; value: string };
  /** 上面卖家列表里已经展示的物品 id */
  excludeIds: string[];
  cardProps: CardProps;
}) {
  const t = useT();
  const [similar, setSimilar] = useState<Item[]>([]);
  const [mode, setMode] = useState<'vector' | 'category' | 'none'>('none');
  const [more, setMore] = useState<Item[]>([]);
  const excludeKey = excludeIds.join(',');

  useEffect(() => {
    let alive = true;
    const shown = new Set(excludeIds);
    (async () => {
      const [simRes, allRes] = await Promise.all([
        fetch(`/api/items/similar?${seller.key}=${encodeURIComponent(seller.value)}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/items?sort=newest').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!alive) return;
      const sim: Item[] = (simRes?.items ?? []).filter((it: Item) => !shown.has(it.id));
      for (const it of sim) shown.add(it.id);
      setSimilar(sim);
      setMode(simRes?.mode ?? 'none');
      setMore(((allRes?.items ?? []) as Item[]).filter(it => !shown.has(it.id)).slice(0, MORE_LIMIT));
    })();
    return () => { alive = false; };
    // excludeIds 每次渲染都是新数组,用拼出来的 key 做依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller.key, seller.value, excludeKey]);

  if (similar.length === 0 && more.length === 0) return null;

  return (
    <div className="mt-8 space-y-8" data-testid="seller-explore">
      {similar.length > 0 && (
        <section data-testid="seller-similar">
          <Divider label={t(mode === 'vector' ? 'seller.similar' : 'seller.sameCategory')} />
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4 items-start">
            {similar.map(item => <ItemCard key={item.id} item={item} {...cardProps} />)}
          </div>
        </section>
      )}
      {more.length > 0 && (
        <section data-testid="seller-more">
          <Divider label={t('seller.more')} />
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4 items-start">
            {more.map(item => <ItemCard key={item.id} item={item} {...cardProps} />)}
          </div>
        </section>
      )}
    </div>
  );
}
