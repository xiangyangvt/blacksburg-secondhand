'use client';

import { useEffect, useState, useCallback } from 'react';
import { ItemCard, type Item } from '@/components/ItemCard';
import { FilterSidebar, type Filters } from '@/components/FilterSidebar';
import { MobileFilterToggle } from '@/components/MobileFilterToggle';
import { PostModal } from '@/components/PostModal';
import { EditCodePrompt } from '@/components/EditCodePrompt';
import { ScrollToTop } from '@/components/ScrollToTop';
import { FabPostButton } from '@/components/FabPostButton';
import { useT } from '@/i18n/I18nProvider';

const DEFAULT_FILTERS: Filters = {
  type: 'all',
  category: 'all',
  q: '',
  minPrice: '',
  maxPrice: '',
  since: 'all',
  sort: 'newest',
};

type CodeAction =
  | { kind: 'edit'; item: Item }
  | { kind: 'delete'; item: Item }
  | { kind: 'sellerDeleteInquiry'; item: Item; inquiryId: string };

export default function HomePage() {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFiltersRaw] = useState<Filters>(DEFAULT_FILTERS);
  const [postModal, setPostModal] = useState<{ mode: 'create' | 'edit'; item?: Item } | null>(null);
  const [codePrompt, setCodePrompt] = useState<CodeAction | null>(null);

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

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (filters.type     !== 'all') sp.set('type', filters.type);
    if (filters.category !== 'all') sp.set('category', filters.category);
    if (filters.q.trim())           sp.set('q', filters.q.trim());
    if (filters.minPrice)           sp.set('minPrice', filters.minPrice);
    if (filters.maxPrice)           sp.set('maxPrice', filters.maxPrice);
    if (filters.since !== 'all')    sp.set('since', filters.since);
    sp.set('sort', filters.sort);

    try {
      const res = await fetch(`/api/items?${sp}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleEdit = async (code: string, item: Item) => {
    const res = await fetch(`/api/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCode: code, title: item.title }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || t('code.errWrong'));
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
    if (!res.ok) { alert(data.error || t('inq.errDelete')); return; }
    setCodePrompt(null);
    fetchItems();
  };

  const handleSellerDeleteInquiry = async (code: string, item: Item, inquiryId: string) => {
    const res = await fetch(
      `/api/inquiries/${inquiryId}?itemEditCode=${encodeURIComponent(code)}`,
      { method: 'DELETE' },
    );
    const data = await res.json();
    if (!res.ok) { alert(data.error || t('inq.errDelete')); return; }
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
    if (res.ok) alert(t('report.thanks'));
    else alert(t('report.failed'));
  };

  return (
    <main className="min-h-screen">
      {/* 顶栏 — 全程 sticky（含手机端折叠筛选），始终黏在屏顶 */}
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-brand whitespace-nowrap">
            🏠 {t('site.brand')}
          </h1>
          <div className="flex-1 min-w-[200px]">
            <input
              value={filters.q}
              onChange={e => setFiltersRaw(f => ({ ...f, q: e.target.value }))}
              placeholder={t('header.search')}
              className="w-full border border-stone-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-brand"
            />
          </div>

          <button
            onClick={() => setPostModal({ mode: 'create' })}
            className="hidden sm:block px-4 py-2 bg-brand text-white rounded-full hover:bg-brand-dark text-sm font-medium"
          >
            {t('header.post')}
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
          {/* 计数 */}
          {!loading && items.length > 0 && (
            <div className="text-xs text-stone-500 mb-2 px-1">
              {t('list.count', { n: items.length })}
            </div>
          )}

          {loading ? (
            <SkeletonGrid />
          ) : items.length === 0 ? (
            <div className="text-center text-stone-500 py-20">
              <div className="text-5xl mb-3">📭</div>
              <div className="mb-3">{t('list.empty')}</div>
              <button
                onClick={() => setPostModal({ mode: 'create' })}
                className="text-brand underline hover:text-brand-dark"
              >
                {t('list.beFirst')}
              </button>
            </div>
          ) : (
            // 手机 2 列网格 / 桌面单列宽卡
            <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
              {items.map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
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
          本站开源 · MIT 协议 ·{' '}
          <a
            href="https://github.com/xiangyangvt/blacksburg-secondhand"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand hover:text-brand-dark hover:underline font-medium"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            xiangyangvt/blacksburg-secondhand
          </a>
          {' '}· 欢迎提 issue 或 PR
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
