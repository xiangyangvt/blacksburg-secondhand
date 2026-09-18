'use client';

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { ItemCard, type Item } from '@/components/ItemCard';
import { SiteFooter } from '@/components/SiteFooter';
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
import { SemanticResults, EMPTY_SEMANTIC, type SemanticState } from '@/components/SemanticResults';
import { SearchChat } from '@/components/SearchChat';
import { FeedbackLink } from '@/components/FeedbackCard';
import { buildSiteShareText, clientOrigin } from '@/lib/shareText';
import { captureUtmFromUrl } from '@/lib/utm';
import { useT } from '@/i18n/I18nProvider';
import { showError, showSuccess } from '@/lib/toast';
import { Plus, Share2, PackageOpen, Shuffle } from 'lucide-react';
import { sortWithDayJitter, shuffleAll } from '@/lib/sortJitter';

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
    // Phase 3C: 默认 'random' — 同日 jitter 随机展示;用户主动选 'newest' 才严格时间序
    sort:     sort === 'newest' || sort === 'oldest' || sort === 'priceAsc' || sort === 'priceDesc' ? sort : 'random',
    sameSellerAs: get('sameSellerAs'),  // Sprint 6.7g / 9A:同卖家曝光 toast 触发,?sameSellerAs=<itemId>
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
  if (f.sort  !== 'random') sp.set('sort', f.sort);
  if (f.sameSellerAs)       sp.set('sameSellerAs', f.sameSellerAs);
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
  // Sprint 10B:第 1 层语义结果;无 q 时始终 EMPTY(整块不渲染)
  const [semantic, setSemantic] = useState<SemanticState>(EMPTY_SEMANTIC);
  // Sprint 11E:统一问询栏。搜索栏回车 / 点发送 = 把当前输入交给对话;id 自增,SearchChat 见 id 变就发一次
  const [ask, setAsk] = useState<{ id: number; text: string } | null>(null);
  // chatEnabled 跟着每次搜索响应来,换词瞬间会短暂回到 false;对话开着时不该因此闪没 → 记住"见过可用"
  const [chatSeen, setChatSeen] = useState(false);
  useEffect(() => { if (semantic.chatEnabled) setChatSeen(true); }, [semantic.chatEnabled]);
  // 回车可能早于第一次搜索响应(还不知道对话可不可用):那句话先留着,响应说可用就发;说不可用就丢掉,
  // 免得之后 AI 恢复时把一句陈年旧话发出去
  useEffect(() => { if (!loading && !semantic.chatEnabled && !chatSeen) setAsk(null); }, [loading, semantic.chatEnabled, chatSeen]);
  // 请求版本:每次 fetchItems +1;晚到的旧响应(关键词或语义)一律丢弃,防止旧按钮请求覆盖新搜索(Codex 互审 #3)
  // 每个 await 之后、每次 setState 之前都要比对(二轮 #1)
  const reqSeq = useRef(0);
  // 当前版本实际展示的关键词 id:语义结果回来时再按它过滤一次(两段请求之间数据可能变了,二轮 #3)
  const keywordIdsRef = useRef<Set<string>>(new Set());
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

  // Phase 3B 二手 random A+B(Sean 设计):
  // A. 同日 jitter — 跨天严格倒序,同一天发的随机互换顺序(seed 来自 jitterSeed)
  // B. 「换一批」按钮 — 完全 shuffle 当前可见列表(每次点击换 seed)
  const [jitterSeed, setJitterSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [shuffleMode, setShuffleMode] = useState(false);  // 用户点了「换一批」就进 shuffle mode
  // 重新 fetch 时退出 shuffle mode,回到 jitter 默认
  useEffect(() => { setShuffleMode(false); }, [items]);

  const visibleItems = useMemo(() => {
    const filtered = filters.onlyRecent
      ? items.filter(it => recentIds.includes(it.id))
      : items;
    // Phase 3C: 默认 sort='random' 时同日 jitter;用户主动选 'newest' 等其他排序则严格按 API 顺序(无 jitter)
    if (shuffleMode) return shuffleAll(filtered, jitterSeed);
    if (filters.sort === 'random') return sortWithDayJitter(filtered, jitterSeed);
    return filtered; // API 已经按 filters.sort 排好,不再动顺序
  }, [items, recentIds, filters.onlyRecent, filters.sort, shuffleMode, jitterSeed]);

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

  const buildListParams = useCallback(() => {
    const sp = new URLSearchParams();
    if (filters.type     !== 'all') sp.set('type', filters.type);
    if (filters.category !== 'all') sp.set('category', filters.category);
    const q = debouncedQ.trim();
    if (q)                          sp.set('q', q);
    if (filters.minPrice)           sp.set('minPrice', filters.minPrice);
    if (filters.maxPrice)           sp.set('maxPrice', filters.maxPrice);
    if (filters.since !== 'all')    sp.set('since', filters.since);
    if (filters.sameSellerAs)       sp.set('sameSellerAs', filters.sameSellerAs);
    // Phase 3C: random 是前端 jitter 模式,API 不认识 — 映射成 newest(API 按时间倒序返回,前端再 jitter)
    sp.set('sort', filters.sort === 'random' ? 'newest' : filters.sort);
    return { sp, q };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.type, filters.category, debouncedQ, filters.minPrice, filters.maxPrice, filters.since, filters.sort, filters.sameSellerAs]);

  // Sprint 10B:语义层单独一段请求(semantic=1)。trigger=auto 时关键词层渲染后自动发;trigger=button 时用户点按钮才发。
  // 关键词层永远不等 embedding;失败时 requested 复位,按钮回来可以重试(互审 #4 #7)
  const requestSemantic = useCallback(async (seq: number) => {
    if (seq !== reqSeq.current) return; // 旧闭包续跑过来的调用,直接忽略
    const { sp, q } = buildListParams();
    if (!q) return;
    sp.set('site', 'items');
    sp.set('semantic', '1');
    setSemantic(s => ({ ...s, loading: true, requested: true }));
    try {
      const res = await fetch(`/api/search?${sp}`);
      const data = await res.json();
      if (seq !== reqSeq.current) return; // 查询已变,丢弃
      const shown = keywordIdsRef.current;
      const list: Item[] = (data.semantic ?? []).filter((it: Item) => !shown.has(it.id));
      setSemantic(s => ({ ...s, loading: false, list, limited: res.status === 429 || !!data.limited }));
    } catch {
      if (seq !== reqSeq.current) return;
      setSemantic(s => ({ ...s, loading: false, list: [], requested: false }));
    }
  }, [buildListParams]);

  const fetchMoreSimilar = useCallback(() => requestSemantic(reqSeq.current), [requestSemantic]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const seq = ++reqSeq.current;
    // 新查询开始就清掉旧的语义卡片 / 按钮,等第一段响应给出本次 trigger 再开放(二轮 #2)
    setSemantic(EMPTY_SEMANTIC);
    keywordIdsRef.current = new Set();
    const { sp, q } = buildListParams();
    let autoSemantic = false;

    try {
      // Sprint 10B:有关键词走 /api/search(semantic=0:只要第 0 层与 trigger);无关键词仍走列表 GET,首屏不多一次调用
      let fetched: Item[];
      if (q) {
        sp.set('site', 'items');
        sp.set('semantic', '0');
        const res = await fetch(`/api/search?${sp}`);
        const data = await res.json();
        if (seq !== reqSeq.current) return;
        fetched = data.keyword ?? [];
        keywordIdsRef.current = new Set(fetched.map(it => it.id));
        setSemantic({ aiEnabled: !!data.aiEnabled, trigger: data.trigger ?? null, list: [], loading: false, requested: false, limited: false, chatEnabled: !!data.chatEnabled });
        autoSemantic = !!data.aiEnabled && data.trigger === 'auto';
      } else {
        const res = await fetch(`/api/items?${sp}`);
        const data = await res.json();
        if (seq !== reqSeq.current) return;
        fetched = data.items ?? [];
        setSemantic(EMPTY_SEMANTIC);
      }
      setItems(fetched);
      // 跟购物清单同步：找不到 id 的 cart item 静默移除；找到的更新 snapshot
      try {
        const { syncCart } = await import('@/lib/shoppingCart');
        if (seq === reqSeq.current) syncCart(fetched);
      } catch {}
    } finally {
      // 旧请求的 finally 不能关掉新请求的加载态
      if (seq === reqSeq.current) setLoading(false);
    }
    // 第 0 层已渲染,再去要语义层(骨架在这段时间显示);版本再核对一次
    if (autoSemantic && seq === reqSeq.current) void requestSemantic(seq);
  }, [buildListParams, requestSemantic]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Sprint 6.7g:同卖家曝光 toast → router.push(/?seller=X),需要在 URL 变化时把 seller 同步进 state
  const sameSellerFromUrl = searchParams.get('sameSellerAs') ?? undefined;
  useEffect(() => {
    if (sameSellerFromUrl !== filters.sameSellerAs) {
      setFiltersRaw(f => ({ ...f, sameSellerAs: sameSellerFromUrl }));
    }
  }, [sameSellerFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // 9A:列表 item 的联系方式是脱敏的,用 verify-code 返回的所有者联系方式补回,编辑表单才能预填
    setPostModal({
      mode: 'edit',
      item: {
        ...item,
        contactType: data.contactType ?? item.contactType,
        contactValue: data.contactValue ?? item.contactValue,
        customContactLabel: data.customContactLabel ?? item.customContactLabel,
      },
    });
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

  // 第 1、2 层里的卡片与第 0 层共用同一套回调
  const semanticCardProps = {
    onEdit: (it: Item) => setCodePrompt({ kind: 'edit', item: it }),
    onMarkSold: (it: Item) => setCodePrompt({ kind: 'delete', item: it }),
    onReport: handleReport,
    onDeleteInquiryAsSeller: (it: Item, inqId: string) => setCodePrompt({ kind: 'sellerDeleteInquiry', item: it, inquiryId: inqId }),
    refresh: fetchItems,
  };

  return (
    <main className="min-h-screen">
      {/* 顶栏 — 全程 sticky（含手机端折叠筛选），始终黏在屏顶
          设计 V2：去 emoji、wordmark 取代 emoji 站名、品牌红只在主 CTA 出现 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3">
          {/* 平台 tab(Sprint 7:3 tab — 黑堡 / 二手 / 室友&转租) */}
          <PlatformTabs />

          {/* 搜索 — 桌面常驻 max-w-260px,移动 icon 化 */}
          <SearchBox
            value={filters.q}
            onChange={(v) => setFiltersRaw(f => ({ ...f, q: v }))}
            placeholder={t(chatSeen ? 'header.searchAsk' : 'header.search')}
            ask={{
              onAsk: () => { const text = filters.q.trim(); if (text) setAsk(a => ({ id: (a?.id ?? 0) + 1, text })); },
              showButton: chatSeen,
              buttonLabel: t('search.askButton'),
            }}
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

          {/* 最右：发布（主 CTA；手机端走 FAB)
              注:Sprint 7.1 移除了 ShareButton 让 / 跟 /roommates header 对齐(我的按钮同 X 位置) */}
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
          {filters.sameSellerAs && (
            <div className="mb-3 p-3 rounded-lg bg-brand/5 border border-brand/20 text-stone-800 text-sm flex items-center gap-2">
              <span>正在看同一卖家的所有商品</span>
              <button
                onClick={() => updateFilter({ sameSellerAs: undefined })}
                className="ml-auto text-brand hover:text-brand-dark underline whitespace-nowrap"
              >
                ✕ 清除
              </button>
            </div>
          )}

          {/* "最近看过" 改成 filter chip 了（在 MobileFilterToggle / FilterSidebar 里），不再 strip */}

          {/* 计数 + 换一批按钮(Phase 3B Sean 设计) */}
          {!loading && visibleItems.length > 0 && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="text-xs text-stone-500">
                {t('list.count', { n: visibleItems.length })}
                {filters.onlyRecent && <span className="text-brand ml-1">· 只看最近浏览过</span>}
                {shuffleMode && <span className="text-brand ml-1">· 已换一批</span>}
              </div>
              {visibleItems.length >= 4 && (
                <button
                  type="button"
                  onClick={() => {
                    setJitterSeed(Math.floor(Math.random() * 1_000_000));
                    setShuffleMode(true);
                  }}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-stone-600 hover:text-brand"
                  title="换一批 — 重新打乱当前可见的商品"
                >
                  <Shuffle size={12} />
                  换一批
                </button>
              )}
            </div>
          )}

          {/* Sprint 11E:搜索栏交来的对话,列表上方就地展开。AI 关 / 熔断时 chatSeen 为 false,回车不出任何东西 */}
          {ask && chatSeen && (
            <SearchChat
              ask={ask}
              filters={Object.fromEntries(
                [...buildListParams().sp.entries()].filter(([k]) => ['type', 'category', 'minPrice', 'maxPrice', 'since', 'sameSellerAs'].includes(k)),
              )}
              cardProps={semanticCardProps}
              onClose={() => setAsk(null)}
            />
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
              {/* 11E:卡壳时刻的兜底反馈入口,不依赖 AI */}
              {debouncedQ.trim() && <div className="mt-6 max-w-md mx-auto"><FeedbackLink source="empty" /></div>}
            </div>
          ) : (
            // 手机 2 列网格 / 桌面单列宽卡
            // items-start:不让同行卡片等高拉伸 —— 无图文字帖保持内容自然高度,
            // 否则跟邻居图片卡拉齐后卡底出现整块空白(看着像图片区没加载)
            <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4 items-start">
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

          {/* Sprint 10B:第 1 层「相关结果 · AI 语义匹配」。只看最近浏览时不显示(那是本地过滤视图) */}
          {debouncedQ.trim() && !filters.onlyRecent && (
            <SemanticResults<Item>
              state={semantic}
              onRequestMore={fetchMoreSimilar}
              renderCard={(item, badge) => <ItemCard key={item.id} item={item} badge={badge} {...semanticCardProps} />}
              onAsk={() => { const text = debouncedQ.trim(); if (text) { setAsk(a => ({ id: (a?.id ?? 0) + 1, text })); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}
            />
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

      <SiteFooter />
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
