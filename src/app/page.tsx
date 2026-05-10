'use client';

import { useEffect, useState, useCallback } from 'react';
import { ItemCard, type Item } from '@/components/ItemCard';
import { FilterSidebar, type Filters } from '@/components/FilterSidebar';
import { PostModal } from '@/components/PostModal';
import { EditCodePrompt } from '@/components/EditCodePrompt';
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
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [postModal, setPostModal] = useState<{ mode: 'create' | 'edit'; item?: Item } | null>(null);
  const [codePrompt, setCodePrompt] = useState<CodeAction | null>(null);

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
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-brand whitespace-nowrap">
            🏠 {t('site.brand')}
          </h1>
          <div className="flex-1 min-w-[200px]">
            <input
              value={filters.q}
              onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
              placeholder={t('header.search')}
              className="w-full border border-stone-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-brand"
            />
          </div>

          {/* 语言切换暂时隐藏 — 想恢复时把这里加回来即可。i18n 基础设施保留。
          <div className="flex items-center gap-0 border border-stone-300 rounded-full overflow-hidden text-sm">
            <button onClick={() => setLocale('zh')} className={`px-3 py-1 ${locale === 'zh' ? 'bg-brand text-white' : 'bg-white text-stone-700 hover:bg-stone-100'}`}>中</button>
            <button onClick={() => setLocale('en')} className={`px-3 py-1 ${locale === 'en' ? 'bg-brand text-white' : 'bg-white text-stone-700 hover:bg-stone-100'}`}>EN</button>
          </div>
          （记得把上面的 useI18n import 和 const { locale, setLocale } = useI18n() 也加回来）
          */}

          <button
            onClick={() => setPostModal({ mode: 'create' })}
            className="hidden sm:block px-4 py-2 bg-brand text-white rounded-full hover:bg-brand-dark text-sm font-medium"
          >
            {t('header.post')}
          </button>
        </div>
      </header>

      {/* 主内容 */}
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row gap-6">
        <FilterSidebar filters={filters} onChange={p => setFilters(f => ({ ...f, ...p }))} />

        <section className="flex-1 min-w-0">
          {/* 计数 */}
          {!loading && items.length > 0 && (
            <div className="text-xs text-stone-500 mb-3">
              {t('list.count', { n: items.length })}
            </div>
          )}

          {loading ? (
            <SkeletonList />
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
            <div className="space-y-4">
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

      {/* 浮动按钮（手机最易点） */}
      <button
        onClick={() => setPostModal({ mode: 'create' })}
        className="sm:hidden fixed right-5 bottom-5 z-20 w-14 h-14 rounded-full bg-brand text-white shadow-lg flex items-center justify-center text-2xl hover:bg-brand-dark"
        aria-label={t('header.post')}
      >
        ➕
      </button>

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

      <footer className="text-center text-xs text-stone-500 py-8 border-t border-stone-200 mt-8">
        <p>{t('footer.opensource')}</p>
        <p className="mt-1">{t('footer.prohibited')}</p>
      </footer>
    </main>
  );
}

// 加载骨架屏
function SkeletonList() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-lg border border-stone-200 p-4 animate-pulse">
          <div className="flex gap-2 mb-3">
            <div className="h-5 w-12 bg-stone-200 rounded-full" />
            <div className="h-5 w-16 bg-stone-200 rounded-full" />
          </div>
          <div className="h-6 bg-stone-200 rounded w-2/3 mb-2" />
          <div className="h-4 bg-stone-100 rounded w-full mb-1" />
          <div className="h-4 bg-stone-100 rounded w-3/4 mb-3" />
          <div className="flex gap-2 mb-3">
            <div className="h-24 w-24 bg-stone-200 rounded" />
            <div className="h-24 w-24 bg-stone-200 rounded" />
          </div>
          <div className="h-8 w-32 bg-stone-200 rounded" />
        </div>
      ))}
    </div>
  );
}
