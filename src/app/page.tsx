'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { ItemCard, type Item } from '@/components/ItemCard';
import { FilterSidebar, type Filters } from '@/components/FilterSidebar';
import { MobileFilterToggle } from '@/components/MobileFilterToggle';
import { PostModal } from '@/components/PostModal';
import { EditCodePrompt } from '@/components/EditCodePrompt';
import { ScrollToTop } from '@/components/ScrollToTop';
import { FabPostButton } from '@/components/FabPostButton';
import { ShareButton } from '@/components/ShareButton';
import { MyPostsPanel } from '@/components/MyPostsPanel';
import { getRecentViewIds } from '@/lib/recentViews';
import { useUnreadCount, markSeen } from '@/lib/notifications';
import { PlatformTabs } from '@/components/PlatformTabs';
import { SearchBox } from '@/components/SearchBox';
import { buildSiteShareText, clientOrigin } from '@/lib/shareText';
import { captureUtmFromUrl } from '@/lib/utm';
import { useT } from '@/i18n/I18nProvider';
import { showError, showSuccess } from '@/lib/toast';
import { Plus, Share2, PackageOpen } from 'lucide-react';

// 把 URL ?type=...&cat=... 解析回 Filters。未知/非法值都退到默认，保证健壮。
function parseFiltersFromSearchParams(sp: ReadonlyURLSearchParams | URLSearchParams): Filters {
  const get = (k: string) => sp.get(k) ?? undefined;
  const type = get('type');
  const since = get('since');
  const sort = get('sort');
  return {
    type:     type === 'sell' || type === 'buy' ? type : 'all',
    category: get('category') ?? 'all',
    q:        get('q') ?? '',
    minPrice: get('minPrice') ?? '',
    maxPrice: get('maxPrice') ?? '',
    since:    since === '1d' || since === '1w' || since === '1m' ? since : 'all',
    sort:     sort === 'oldest' || sort === 'priceAsc' || sort === 'priceDesc' ? sort : 'newest',
    seller:   get('seller'),  // Sprint 6.7g:同卖家曝光 toast 触发,?seller=contactValue
  };
}

// 用 debouncedQ（而不是 filters.q）写回 URL —— URL 只反映"提交过"的搜索词
function buildFiltersSearch(f: Filters, debouncedQ: string): string {
  const sp = new URLSearchParams();
  if (f.type     !== 'all') sp.set('type', f.type);
  if (f.category !== 'all') sp.set('category', f.category);
  const q = debouncedQ.trim();
  if (q)                    sp.set('q', q);
  if (f.minPrice)           sp.set('minPrice', f.minPrice);
  if (f.maxPrice)           sp.set('maxPrice', f.maxPrice);
  if (f.since !== 'all')    sp.set('since', f.since);
  if (f.sort  !== 'newest') sp.set('sort', f.sort);
  if (f.seller)             sp.set('seller', f.seller);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

type CodeAction =
  | { kind: 'edit'; item: Item }
  | { kind: 'delete'; item: Item }
  | { kind: 'sellerDeleteInquiry'; item: Item; inquiryId: string };

// 默认导出包一层 Suspense —— Next.js 14 要求用 useSearchParams 的客户端页面外层 Suspense
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const t = useT();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(clientOrigin());
    captureUtmFromUrl(); // 首屏抓 ?utm_source=xxx / ?from=xxx 存 sessionStorage，后续发布/询价都带上
  }, []);
  // 初次渲染从 URL 解析；之后状态独立，由 state → URL 单向同步
  const [filters, setFiltersRaw] = useState<Filters>(() => parseFiltersFromSearchParams(searchParams));
  const [postModal, setPostModal] = useState<{ mode: 'create' | 'edit'; item?: Item } | null>(null);
  const [codePrompt, setCodePrompt] = useState<CodeAction | null>(null);
  const [myPanelOpen, setMyPanelOpen] = useState(false);
  const unreadItems = useUnreadCount('item');

  // /?focus=ID:Sprint 6.7h 改造 —— 改成 derived from searchParams,响应 router.push 跳转
  // (老版本 useState 只取初值,toast 缩略图 router.push 后 focusId 不更新 → 卡片不展开)
  const focusId = searchParams.get('focus');

  // /cart 旧路由 redirect 过来时带 ?openWishlist=1（旧 ?openCart=1 兼容）→ mount 时触发心愿单 panel 打开
  useEffect(() => {
    const wantsOpen = searchParams.get('openWishlist') === '1' || searchParams.get('openCart') === '1';
    if (wantsOpen) {
      // 等 CartButton 完成 mount 并注册 listener（一个 raf 就够，hydration 已完成）
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('hb-open-cart'));
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // items 加载完后判断 focus 商品是否存在；不存在显示"该商品已下架"banner
  const focusFound = !!focusId && items.some(it => it.id === focusId);
  const focusMissing = !!focusId && !loading && items.length > 0 && !focusFound;

  // "最近看过" client-side filter：用 localStorage 里的 recentViewIds 过滤 items
  // 用 state + mount 时读避免 SSR/hydration 不一致
  const [recentIds, setRecentIds] = useState<string[]>([]);
  useEffect(() => { setRecentIds(getRecentViewIds('item')); }, [items]);
  const visibleItems = filters.onlyRecent
    ? items.filter(it => recentIds.includes(it.id))
    : items;

  // 改任何 filter 都自动滚回顶部（除了 q 输入，那个用户在打字时不打断）
  const setFilters = useCallback((updater: (f: Filters) => Filters) => {
    setFiltersRaw(prev => {
      const next = updater(prev);
      const onlyQChanged = Object.keys(next).every(
        k => k === 'q' || (next as any)[k] === (prev as any)[k]
      );
      if (!onlyQChanged) {
        // 双 raf 保证 DOM 更新完再滚
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            window.scrollTo({ top: 0, behavior: 'smooth' })
          )
        );
      }
      return next;
    });
  }, []);

  const updateFilter = useCallback(
    (p: Partial<Filters>) => setFilters(f => ({ ...f, ...p })),
    [setFilters]
  );

  // 防抖搜索词：用户停止输入 300ms 后才触发后端查询，避免每个字符都打一次接口
  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  useEffect(() => {
    if (filters.q === debouncedQ) return;
    const id = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(id);
  }, [filters.q, debouncedQ]);

  // 把 filters 同步回 URL（用 replaceState，不进历史栈、不触发 Next.js 导航）
  // 这样用户可以复制当前 URL 分享筛选状态
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const search = buildFiltersSearch(filters, debouncedQ);
    const target = `${window.location.pathname}${search}${window.location.hash}`;
    if (target !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, '', target);
    }
  }, [filters, debouncedQ]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (filters.type     !== 'all') sp.set('type', filters.type);
    if (filters.category !== 'all') sp.set('category', filters.category);
    const q = debouncedQ.trim();
    if (q)                          sp.set('q', q);
    if (filters.minPrice)           sp.set('minPrice', filters.minPrice);
    if (filters.maxPrice)           sp.set('maxPrice', filters.maxPrice);
    if (filters.since !== 'all')    sp.set('since', filters.since);
    if (filters.seller)             sp.set('seller', filters.seller);
    sp.set('sort', filters.sort);

    try {
      const res = await fetch(`/api/items?${sp}`);
      const data = await res.json();
      const fetched: Item[] = data.items ?? [];
      setItems(fetched);
      // 跟购物清单同步：找不到 id 的 cart item 静默移除；找到的更新 snapshot
      try {
        const { syncCart } = await import('@/lib/shoppingCart');
        syncCart(fetched);
      } catch {}
    } finally {
      setLoading(false);
    }
    // 故意不把 filters.q 放进依赖：q 通过 debouncedQ 才触发 fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.type, filters.category, debouncedQ, filters.minPrice, filters.maxPrice, filters.since, filters.sort, filters.seller]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Sprint 6.7g:同卖家曝光 toast → router.push(/?seller=X),需要在 URL 变化时把 seller 同步进 state
  const sellerFromUrl = searchParams.get('seller') ?? undefined;
  useEffect(() => {
    if (sellerFromUrl !== filters.seller) {
      setFiltersRaw(f => ({ ...f, seller: sellerFromUrl }));
    }
  }, [sellerFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEdit = async (code: string, item: Item) => {
    // 用专门的 verify-code 端点（之前是发"假 PATCH"验证，hack 性质，改用干净的方式）
    const res = await fetch(`/api/items/${item.id}/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCode: code }),
    });
    const data = await res.json();
    if (!res.ok || !data.valid) {
      showError(data.error || t('code.errWrong'));
      return;
    }
    setCodePrompt(null);
    setPostModal({ mode: 'edit', item });
  };

  const handleDelete = async (code: string, item: Item) => {
    const res = await fetch(`/api/items/${item.id}?editCode=${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) { showError(data.error || t('inq.errDelete')); return; }
    setCodePrompt(null);
    fetchItems();
  };

  const handleSellerDeleteInquiry = async (code: string, item: Item, inquiryId: string) => {
    const res = await fetch(
      `/api/inquiries/${inquiryId}?itemEditCode=${encodeURIComponent(code)}`,
      { method: 'DELETE' },
    );
    const data = await res.json();
    if (!res.ok) { showError(data.error || t('inq.errDelete')); return; }
    setCodePrompt(null);
    fetchItems();
  };

  const handleReport = async (item: Item) => {
    const reason = prompt(t('report.prompt'));
    if (reason === null) return;
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'item', targetId: item.id, reason }),
    });
    if (res.ok) showSuccess(t('report.thanks'));
    else showError(t('report.failed'));
  };

  return (
    <main className="min-h-screen">
      {/* 顶栏 — 全程 sticky（含手机端折叠筛选），始终黏在屏顶
          设计 V2：去 emoji、wordmark 取代 emoji 站名、品牌红只在主 CTA 出现 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
          {/* 黑堡 wordmark (Sprint 7):点击进 /localnews 信息流 hub */}
          <Link
            href="/localnews"
            className="font-bold text-stone-900 hover:text-brand whitespace-nowrap text-base sm:text-lg tracking-tight flex-shrink-0 transition-colors"
          >
            黑堡
          </Link>

          {/* 平台 tab — 二手 / 室友&转租 平铺(Sprint 6.5 改造,替代 ▾ dropdown) */}
          <PlatformTabs />

          {/* 搜索 — 桌面常驻 max-w-260px,移动 icon 化 */}
          <SearchBox
            value={filters.q}
            onChange={(v) => setFiltersRaw(f => ({ ...f, q: v }))}
            placeholder={t('header.search')}
          />

          {/* spacer:桌面把右侧按钮推到右边 */}
          <div className="flex-1 hidden md:block" />

          {/* 右：我的（toggle + 新消息红点徽章） */}
          <button
            onClick={() => {
              setMyPanelOpen(o => !o);
              if (!myPanelOpen) markSeen('item');  // 打开时标记已读
            }}
            className={`relative px-3 sm:px-4 py-2 rounded-chip text-sm font-medium whitespace-nowrap transition-colors ${
              myPanelOpen
                ? 'bg-brand text-white border border-brand shadow-card'
                : 'bg-white border border-stone-300 hover:border-stone-400 text-stone-700'
            }`}
            aria-expanded={myPanelOpen}
          >
            {t('my.headerLink')}
            {unreadItems > 0 && !myPanelOpen && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                {unreadItems > 9 ? '9+' : unreadItems}
              </span>
            )}
          </button>

          {/* 右：分享本站（仅桌面） */}
          {origin && (
            <ShareButton
              shareText={buildSiteShareText({ origin })}
              label={t('site.shareSite')}
              icon={<Share2 size={16} />}
              className="hidden md:inline-flex"
            />
          )}

          {/* 最右：发布（主 CTA；手机端走 FAB） */}
          <button
            onClick={() => setPostModal({ mode: 'create' })}
            className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-chip hover:bg-brand-dark active:scale-95 transition-all text-sm font-medium whitespace-nowrap shadow-card"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>{t('header.post')}</span>
          </button>
        </div>

        {/* 手机端折叠筛选——和顶栏同一 sticky 单元，一起黏顶 */}
        <div className="md:hidden max-w-6xl mx-auto px-3 pb-2">
          <MobileFilterToggle filters={filters} onChange={updateFilter} />
        </div>
      </header>

      {/* 主内容 */}
      <div className="max-w-6xl mx-auto px-3 md:px-4 py-3 md:py-4 flex flex-col md:flex-row gap-4 md:gap-6">
        {/* 桌面端常驻侧栏 */}
        <div className="hidden md:block">
          <FilterSidebar filters={filters} onChange={updateFilter} />
        </div>

        <section className="flex-1 min-w-0">
          {/* focus 命中失败提示（?focus=ID 但商品已下架/被筛掉） */}
          {focusMissing && (
            <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              你访问的商品可能已下架 / 已售出，下面是其他在售商品。
            </div>
          )}

          {/* Sprint 6.7g:seller 过滤激活时的 banner */}
          {filters.seller && (
            <div className="mb-3 p-3 rounded-lg bg-brand/5 border border-brand/20 text-stone-800 text-sm flex items-center gap-2">
              <span>正在看 <strong className="font-mono">{filters.seller}</strong> 的所有商品</span>
              <button
                onClick={() => updateFilter({ seller: undefined })}
                className="ml-auto text-brand hover:text-brand-dark underline whitespace-nowrap"
              >
                ✕ 清除
              </button>
            </div>
          )}

          {/* "最近看过" 改成 filter chip 了（在 MobileFilterToggle / FilterSidebar 里），不再 strip */}

          {/* 计数 */}
          {!loading && visibleItems.length > 0 && (
            <div className="text-xs text-stone-500 mb-2 px-1">
              {t('list.count', { n: visibleItems.length })}
              {filters.onlyRecent && <span className="text-brand ml-1">· 只看最近浏览过</span>}
            </div>
          )}

          {loading ? (
            <SkeletonGrid />
          ) : visibleItems.length === 0 ? (
            <div className="text-center text-stone-500 py-20">
              <PackageOpen size={56} strokeWidth={1.2} className="mx-auto mb-4 text-stone-300" />
              <div className="mb-3">
                {filters.onlyRecent
                  ? '你没浏览过任何符合筛选条件的商品'
                  : t('list.empty')}
              </div>
              {!filters.onlyRecent && (
                <button
                  onClick={() => setPostModal({ mode: 'create' })}
                  className="text-brand underline hover:text-brand-dark"
                >
                  {t('list.beFirst')}
                </button>
              )}
            </div>
          ) : (
            // 手机 2 列网格 / 桌面单列宽卡
            <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
              {visibleItems.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  autoExpand={item.id === focusId}
                  onEdit={(it)        => setCodePrompt({ kind: 'edit',   item: it })}
                  onMarkSold={(it)    => setCodePrompt({ kind: 'delete', item: it })}
                  onReport={handleReport}
                  onDeleteInquiryAsSeller={(it, inqId) =>
                    setCodePrompt({ kind: 'sellerDeleteInquiry', item: it, inquiryId: inqId })
                  }
                  refresh={fetchItems}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 手机端浮动发布按钮 — 首屏宽胶囊带"发布"二字，滚动后收成圆形 */}
      <FabPostButton onClick={() => setPostModal({ mode: 'create' })} label={t('card.fabPost')} ariaLabel={t('header.post')} />

      {/* 浮动回顶部按钮（滚动 >400px 才出现） */}
      <ScrollToTop />

      {/* 模态框们 */}
      {postModal && (
        <PostModal
          mode={postModal.mode}
          initialItem={postModal.item}
          onClose={() => setPostModal(null)}
          onSaved={fetchItems}
        />
      )}

      {myPanelOpen && (
        <MyPostsPanel onClose={() => setMyPanelOpen(false)} />
      )}

      {codePrompt && (
        <EditCodePrompt
          itemId={codePrompt.item.id}
          title={codePrompt.item.title}
          action={
            codePrompt.kind === 'edit' ? t('code.actionEdit')
            : codePrompt.kind === 'delete' ? t('code.actionDelete')
            : t('code.actionDelInq')
          }
          onCancel={() => setCodePrompt(null)}
          onConfirm={async (code) => {
            if (codePrompt.kind === 'edit')   await handleEdit(code, codePrompt.item);
            if (codePrompt.kind === 'delete') {
              if (!confirm(t('code.confirmDelete'))) return;
              await handleDelete(code, codePrompt.item);
            }
            if (codePrompt.kind === 'sellerDeleteInquiry') {
              await handleSellerDeleteInquiry(code, codePrompt.item, codePrompt.inquiryId);
            }
          }}
        />
      )}

      <footer className="text-center text-xs text-stone-500 py-8 border-t border-stone-200 mt-8 space-y-2">
        <p>
          MIT 开源 · 欢迎到{' '}
          <a
            href="https://github.com/xiangyangvt/blacksburg-secondhand"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand hover:text-brand-dark hover:underline font-medium"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            GitHub
          </a>
          {' '}提建议
        </p>
        <p>{t('footer.prohibited')}</p>
      </footer>
    </main>
  );
}

// 加载骨架 — 跟着 grid 自适应
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="bg-white rounded-lg border border-stone-200 p-3 md:p-4 animate-pulse">
          <div className="h-5 w-12 bg-stone-200 rounded-full mb-2" />
          <div className="h-5 bg-stone-200 rounded w-2/3 mb-2" />
          <div className="aspect-square bg-stone-100 rounded mb-2" />
          <div className="h-4 bg-stone-100 rounded w-3/4" />
        </div>
      ))}
    </div>
  );
}
