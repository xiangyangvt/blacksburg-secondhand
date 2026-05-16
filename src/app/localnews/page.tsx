'use client';

// Sprint 7 Phase 1.7+:黑堡本地信息流(/localnews)
// IA:wordmark "黑堡" 点击落地于此;二手 / 室友&转租 仍是子平台 tab
//
// header 结构对齐 /roommates 模板(Sean 要求):
//   PlatformTabs → SearchBox → flex-1 spacer (hidden md:block) → 我的 button
// 黑堡没有"发布"按钮(用户不发活动,我们抓取),所以右侧只有"我的"

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, MessageCircle } from 'lucide-react';
import { PlatformTabs } from '@/components/PlatformTabs';
import { SearchBox } from '@/components/SearchBox';
import { EventCard, type EventCardData } from '@/components/EventCard';
import { EventWishlistButton } from '@/components/EventWishlistButton';

const CATEGORIES = [
  { id: 'all',        label: '全部' },
  { id: 'events',     label: '活动' },
  { id: 'sports',     label: '体育' },
  { id: 'news',       label: '新闻' },
  { id: 'discussion', label: '讨论' },
] as const;

type CatId = typeof CATEGORIES[number]['id'];

export default function LocalNewsPage() {
  const [cat, setCat] = useState<CatId>('all');
  const [q, setQ] = useState('');
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const url = cat === 'all' ? '/api/events?limit=80' : `/api/events?category=${cat}&limit=80`;
    fetch(url)
      .then(r => r.ok ? r.json() : { events: [] })
      .then(d => { if (!cancel) setEvents(d.events ?? []); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [cat]);

  // 搜索 — 客户端实时过滤:title / titleOriginal / description / location 任一命中
  // 不发 API 请求,因为 events 总量已经 fetch 过来(<= 80),内存过滤够快
  const filtered = useMemo(() => {
    if (!q.trim()) return events;
    const needle = q.trim().toLowerCase();
    return events.filter(e =>
      e.title?.toLowerCase().includes(needle) ||
      (e.titleOriginal ?? '').toLowerCase().includes(needle) ||
      (e.description ?? '').toLowerCase().includes(needle) ||
      (e.location ?? '').toLowerCase().includes(needle)
    );
  }, [events, q]);

  // "我的" 按钮点击:走 window event 触发 EventWishlistButton 的 panel
  // (EventWishlistButton 已经监听 'hb-open-event-wishlist',底下 filter 行那个按钮也是同款触发)
  // Phase 2C 会把 panel 升级成多 tab(心愿单 + 我发的留言 + 收到的联系方式),先复用现有 panel
  const openMyPanel = () => {
    window.dispatchEvent(new Event('hb-open-event-wishlist'));
  };

  return (
    <main className="min-h-screen">
      {/* 顶栏 — 跟 / 和 /roommates 同款模板:PlatformTabs + SearchBox + 我的 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
          <PlatformTabs />

          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="搜索活动、地点、组织"
          />

          {/* spacer:桌面把右侧按钮推到右边 */}
          <div className="flex-1 hidden md:block" />

          {/* 我的 — 跟 / 和 /roommates 同款 button 风格 */}
          <button
            onClick={openMyPanel}
            className="relative px-3 sm:px-4 py-2 rounded-chip text-sm font-medium whitespace-nowrap bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors"
          >
            我的
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 md:px-4 py-4">
        {/* Chat 入口占位(Phase 3 实做) */}
        <div className="mb-4 p-4 rounded-card bg-gradient-to-br from-stone-50 to-stone-100 border border-stone-200 flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
            <Sparkles size={18} className="text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-stone-900 text-sm mb-0.5 flex items-center gap-2">
              问黑堡本地
              <span className="text-xs text-stone-400 font-normal">即将推出</span>
            </div>
            <div className="text-xs text-stone-500">
              比如:周末有什么好玩的?附近哪家中餐推荐?VT vs Duke 哪天打?
            </div>
          </div>
          <MessageCircle size={20} className="text-stone-300 flex-shrink-0" />
        </div>

        {/* 类目筛选 chips + 心愿单按钮(同行右对齐,跟 / 和 /roommates 的「我的 / 心愿单」摆位一致) */}
        <div className="mb-4 flex items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar flex-1 min-w-0">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={`px-3 py-1.5 rounded-chip text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  cat === c.id
                    ? 'bg-brand text-white'
                    : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <EventWishlistButton className="flex-shrink-0" />
        </div>

        {/* 搜索过滤后没结果的提示 */}
        {!loading && events.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12 text-stone-500">
            <div className="mb-2">没有匹配「{q}」的活动</div>
            <button
              onClick={() => setQ('')}
              className="text-brand underline text-sm hover:text-brand-dark"
            >
              清空搜索 →
            </button>
          </div>
        )}

        {/* 内容 */}
        {loading ? (
          <SkeletonGrid />
        ) : filtered.length === 0 && !q ? (
          <EmptyState cat={cat} />
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
            {filtered.map(e => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        ) : null}

        {/* 角注 */}
        <p className="text-xs text-stone-400 mt-8 text-center">
          每天早上 7 点自动更新 · 内容版权归各源站所有 · 点卡片展开看详情
        </p>
      </div>
    </main>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white rounded-card border border-stone-200 overflow-hidden animate-pulse">
          <div className="aspect-[4/3] md:aspect-[16/9] bg-stone-100" />
          <div className="p-3 md:p-4 space-y-2">
            <div className="h-4 w-16 bg-stone-200 rounded-full" />
            <div className="h-5 bg-stone-200 rounded w-3/4" />
            <div className="h-3 bg-stone-100 rounded w-1/2" />
            <div className="h-4 bg-stone-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ cat }: { cat: CatId }) {
  return (
    <div className="text-center py-20 text-stone-500">
      <div className="text-5xl mb-4 opacity-40">🌱</div>
      <div className="mb-2">
        {cat === 'all'
          ? '暂无本地内容'
          : `暂无「${CATEGORIES.find(c => c.id === cat)?.label}」类别内容`}
      </div>
      <div className="text-xs text-stone-400">
        每天早上 7 点 GitHub Actions 会自动抓取 11 个本地源,生成中文摘要
      </div>
    </div>
  );
}
