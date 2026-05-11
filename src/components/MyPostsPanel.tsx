'use client';

// "我的发布" 面板：抽出来的可复用组件
// 主页里以 inline 模态形式打开（不跳页面，保持扁平化）；
// /my 路由也复用这个组件作为兼容旧链接的 fallback 落地页

import { useState, useEffect, useCallback } from 'react';
import NextImage from 'next/image';
import { X, FolderOpen, Pencil, Trash2, CheckCircle2, ChevronUp } from 'lucide-react';
import { useT, useLocale } from '@/i18n/I18nProvider';
import {
  categoryLabel,
  formatPrice,
  timeAgo,
  typeLabel,
} from '@/lib/utils';
import { buildItemShareText, clientOrigin } from '@/lib/shareText';
import { ShareButton } from './ShareButton';
import { CopyButton } from './CopyButton';
import { PostModal } from './PostModal';
import { EditCodePrompt } from './EditCodePrompt';
import type { Item } from './ItemCard';

const LS_LAST_CODE      = 'hb_last_edit_code';
const LS_LAST_CONTACT_V = 'hb_my_contact_value';

type ItemWithStatus = Item & { status: 'active' | 'draft' };

/**
 * 渲染内容主体（不含 modal 外壳，方便嵌进 modal 或 standalone 页面）
 * @param onClose 传入时会在查找区显示一个"关闭"按钮；standalone 页面不传
 */
function MyPostsBody({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [contactValue, setContactValue] = useState('');
  const [editCode, setEditCode] = useState('');
  const [items, setItems] = useState<ItemWithStatus[] | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'active' | 'draft'>('active');
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<Item | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(clientOrigin());
    try {
      const v = localStorage.getItem(LS_LAST_CONTACT_V);
      const c = localStorage.getItem(LS_LAST_CODE);
      if (v) setContactValue(v);
      if (c) setEditCode(c);
    } catch {}
  }, []);

  const lookup = useCallback(async () => {
    if (!contactValue.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/items/by-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: contactValue.trim(), editCode }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t('my.errLookup')); return; }
      setItems(data.items as ItemWithStatus[]);
      setActiveCount(data.activeCount ?? 0);
      setDraftCount(data.draftCount ?? 0);
      // 有草稿的话默认显示草稿（用户多半是来管理草稿）
      setTab(data.draftCount > 0 ? 'draft' : 'active');
    } finally {
      setLoading(false);
    }
  }, [contactValue, editCode, t]);

  const handlePublish = async (item: Item) => {
    if (editCode.length < 6) { alert('需要识别码'); return; }
    const res = await fetch(`/api/items/${item.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCode }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || '发布失败'); return; }
    await lookup();
  };

  const handleDelete = async (code: string, item: Item) => {
    const res = await fetch(`/api/items/${item.id}?editCode=${encodeURIComponent(code)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { alert(data.error || '删除失败'); return; }
    setDeletePrompt(null);
    await lookup();
  };

  const visibleItems = (items ?? []).filter(it => it.status === tab);

  return (
    <>
      {/* 查找表单 */}
      <section className="bg-white border border-stone-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-stone-600 mb-3">{t('my.intro')}</p>

        <label className="block text-xs text-stone-500 mb-1">{t('my.contactLabel')}</label>
        <input
          value={contactValue}
          onChange={e => setContactValue(e.target.value)}
          placeholder="例：zhang3 / 13912345678"
          className="w-full border border-stone-300 rounded px-3 py-2 mb-3"
        />

        <label className="block text-xs text-stone-500 mb-1">{t('my.editCodeLabel')}</label>
        <input
          type="password"
          value={editCode}
          onChange={e => setEditCode(e.target.value)}
          placeholder="≥6 位"
          className="w-full border border-stone-300 rounded px-3 py-2 mb-3"
        />

        <div className="flex items-center gap-2">
          <button
            onClick={lookup}
            disabled={!contactValue.trim() || loading}
            className="px-5 py-2 bg-brand text-white rounded hover:bg-brand-dark disabled:opacity-50 text-sm font-medium"
          >
            {loading ? '查找中…' : t('my.lookup')}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 border border-stone-300 bg-white text-stone-700 rounded hover:bg-stone-100 text-sm font-medium transition-colors"
            >
              关闭
            </button>
          )}
        </div>
      </section>

      {/* 结果 */}
      {items !== null && (
        <>
          <div className="flex gap-0 border-b border-stone-200 mb-3">
            <TabBtn active={tab === 'active'} onClick={() => setTab('active')}>
              {t('my.tabActive', { n: activeCount })}
            </TabBtn>
            <TabBtn active={tab === 'draft'} onClick={() => setTab('draft')}>
              {t('my.tabDraft', { n: draftCount })}
            </TabBtn>
          </div>

          {visibleItems.length === 0 ? (
            <div className="text-center text-stone-500 py-12 text-sm">
              {tab === 'draft' ? t('my.draftEmpty') : t('my.empty')}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleItems.map(item => (
                <MyItemRow
                  key={item.id}
                  item={item}
                  locale={locale}
                  origin={origin}
                  onEdit={() => setEditItem(item)}
                  onDelete={() => setDeletePrompt(item)}
                  onPublish={() => handlePublish(item)}
                  isDraft={item.status === 'draft'}
                  t={t}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* 编辑模态框（复用 PostModal） */}
      {editItem && (
        <PostModal
          mode="edit"
          initialItem={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); lookup(); }}
        />
      )}

      {/* 删除识别码确认 */}
      {deletePrompt && (
        <EditCodePrompt
          itemId={deletePrompt.id}
          title={deletePrompt.title}
          action={t('code.actionDelete')}
          onCancel={() => setDeletePrompt(null)}
          onConfirm={async (code) => {
            if (!confirm(t('code.confirmDelete'))) return;
            await handleDelete(code, deletePrompt);
          }}
        />
      )}
    </>
  );
}

/**
 * 主页 inline 用：modal 外壳 + 内容
 * 视觉上和 PostModal 一致（深色遮罩 + 居中容器 + ×）
 */
export function MyPostsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();

  // ESC 关闭 + 锁滚动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 flex items-start justify-center overflow-y-auto p-3 sm:p-4"
      onClick={onClose}
    >
      {/* 真浮窗：高度 fit-content，下方剩余空间显示遮罩透出主页内容 */}
      <div
        className="bg-stone-50 w-full max-w-3xl rounded-card shadow-overlay my-2 sm:my-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white border-b border-stone-200 px-5 py-3 flex items-center justify-between rounded-t-card">
          <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
            <FolderOpen size={20} className="text-brand" />
            {t('my.title')}
          </h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100" aria-label="关闭">
            <X size={22} />
          </button>
        </div>
        <div className="p-4 sm:p-5">
          <MyPostsBody onClose={onClose} />
        </div>

        {/* 底部"收起"按钮：跟内容流末尾，紧贴上一块的分界线；高度自适应内容 */}
        <div className="border-t border-stone-200 px-4 py-3 flex justify-center bg-stone-50 rounded-b-card">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-6 py-2 bg-white border border-stone-300 text-stone-700 rounded-chip hover:bg-stone-100 active:scale-95 text-sm font-medium transition-all shadow-card"
            aria-label="收起我的发布"
          >
            <ChevronUp size={16} />
            收起
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * /my 路由的兼容落地页：不带 modal 外壳，直接渲染
 */
export function MyPostsStandalone() {
  const t = useT();
  return (
    <main className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="text-sm text-stone-600 hover:text-brand">← 回到首页</a>
          <h1 className="text-base font-bold text-brand ml-auto">{t('my.title')}</h1>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-3 md:px-4 py-4">
        <MyPostsBody />
      </div>
    </main>
  );
}

function MyItemRow({
  item,
  locale,
  origin,
  isDraft,
  onEdit,
  onDelete,
  onPublish,
  t,
}: {
  item: ItemWithStatus;
  locale: 'zh' | 'en';
  origin: string;
  isDraft: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
  t: (k: any, v?: any) => string;
}) {
  const photos = item.photoUrls;
  const shareText = origin
    ? buildItemShareText({
        title: item.title,
        price: item.price,
        itemType: item.type,
        category: item.category,
        origin,
        itemId: item.id,
        source: 'my',
      })
    : '';

  return (
    <div className={`bg-white border rounded-lg p-3 flex gap-3 ${isDraft ? 'border-amber-300 bg-amber-50/30' : 'border-stone-200'}`}>
      {photos.length > 0 && (
        <NextImage
          src={photos[0]}
          alt=""
          width={72}
          height={72}
          sizes="72px"
          className="h-18 w-18 sm:h-20 sm:w-20 object-cover rounded flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs mb-1 flex-wrap">
          {isDraft && <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-semibold">草稿</span>}
          <span className={`px-2 py-0.5 rounded-full ${
            item.type === 'sell' ? 'bg-brand text-white' : 'bg-accent text-white'
          }`}>
            {typeLabel(item.type, item.category, locale)}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
            {categoryLabel(item.category, locale)}
          </span>
          <span className="text-stone-400 ml-auto">{timeAgo(item.createdAt, locale)}</span>
        </div>

        <div className="font-medium text-stone-900 truncate">{item.title}</div>
        <div className="text-brand font-bold mb-1">{formatPrice(item.price, locale, item.type, item.category)}</div>

        {item.description && (
          <div className="text-xs text-stone-600 line-clamp-2 mb-2">{item.description}</div>
        )}

        <div className="flex gap-2 flex-wrap text-xs">
          {isDraft && (
            <button
              onClick={onPublish}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium transition-colors"
            >
              <CheckCircle2 size={13} />
              {t('my.publishBtn')}
            </button>
          )}
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 transition-colors"
          >
            <Pencil size={13} />
            {t('my.editBtn')}
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 transition-colors"
          >
            <Trash2 size={13} />
            {t('my.deleteBtn')}
          </button>
          {!isDraft && origin && (
            <ShareButton
              shareText={shareText}
              label={t('card.shareItem')}
              className="!bg-amber-50 !border-amber-300 hover:!bg-amber-100"
            />
          )}
          {!isDraft && (
            <CopyButton text={item.contactValue} label={t('card.copyContact')} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active, children, onClick,
}: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 -mb-px ${
        active
          ? 'border-brand text-brand font-semibold'
          : 'border-transparent text-stone-500 hover:text-stone-800'
      }`}
    >
      {children}
    </button>
  );
}
