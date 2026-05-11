'use client';

// "我的发布" 页：卖家自助管理工具
// - 输入联系方式 → 查看自己所有 active 商品（公开查询；任何人都能查别人的，因为联系方式本就公开）
// - 加输识别码 → 额外看到该识别码下的草稿（私有，bcrypt 验证）
// - 草稿可以一键发布、编辑、删除
// - 一键复制商品分享文本（含 utm_source=my）

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import NextImage from 'next/image';
import { useT, useLocale } from '@/i18n/I18nProvider';
import {
  categoryLabel,
  contactTypeLabel,
  formatPrice,
  timeAgo,
  typeLabel,
} from '@/lib/utils';
import { buildItemShareText, clientOrigin } from '@/lib/shareText';
import { ShareButton } from '@/components/ShareButton';
import { CopyButton } from '@/components/CopyButton';
import { PostModal } from '@/components/PostModal';
import { EditCodePrompt } from '@/components/EditCodePrompt';
import type { Item } from '@/components/ItemCard';

const LS_LAST_CODE      = 'hb_last_edit_code';
const LS_LAST_CONTACT_V = 'hb_my_contact_value';

type ItemWithStatus = Item & { status: 'active' | 'draft' };

export default function MyPage() {
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
      // 默认 tab：有草稿就显示草稿（用户进来多半是要管草稿），否则上架中
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
    <main className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-sm text-stone-600 hover:text-brand">← 回到首页</Link>
          <h1 className="text-base font-bold text-brand ml-auto">{t('my.title')}</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-3 md:px-4 py-4">
        {/* 查找表单 */}
        <section className="bg-white border border-stone-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-stone-600 mb-3">{t('my.intro')}</p>

          <label className="block text-xs text-stone-500 mb-1">{t('my.contactLabel')}</label>
          <input
            value={contactValue}
            onChange={e => setContactValue(e.target.value)}
            placeholder="例：zhang3 / 13912345678"
            className="w-full border border-stone-300 rounded px-3 py-2 mb-3 text-sm"
          />

          <label className="block text-xs text-stone-500 mb-1">{t('my.editCodeLabel')}</label>
          <input
            type="password"
            value={editCode}
            onChange={e => setEditCode(e.target.value)}
            placeholder="≥6 位"
            className="w-full border border-stone-300 rounded px-3 py-2 mb-3 text-sm"
          />

          <button
            onClick={lookup}
            disabled={!contactValue.trim() || loading}
            className="px-5 py-2 bg-brand text-white rounded hover:bg-brand-dark disabled:opacity-50 text-sm font-medium"
          >
            {loading ? '查找中…' : t('my.lookup')}
          </button>
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
      </div>

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
              className="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium"
            >
              {t('my.publishBtn')}
            </button>
          )}
          <button
            onClick={onEdit}
            className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100"
          >
            {t('my.editBtn')}
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100"
          >
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
