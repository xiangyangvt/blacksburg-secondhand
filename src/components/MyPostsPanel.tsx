'use client';

// "我的发布" 面板：双平台 + 三动作版
// - 外层 tab：买卖二手 / 找室友
// - 买卖二手平台：内层 tab = 发布中 / 草稿
// - 找室友平台：内层 tab = 我发的 / 申请收件 / 我发的申请
//   ├ 我发的 → listing 列表（草稿 + 发布中混合）
//   ├ 申请收件 → 我的 listings 收到的所有 application
//   └ 我发的申请 → 我对别人 listings 发出的 application
// - lookup 时并发拉 items + listings (with applications) + my-applications 三端

import { useState, useEffect, useCallback } from 'react';
import NextImage from 'next/image';
import {
  X, FolderOpen, Pencil, Trash2, CheckCircle2, ChevronUp,
  Home, ShoppingBag, MapPin, Calendar,
  Inbox, Send, Check, XCircle, Clock, AlertTriangle,
} from 'lucide-react';
import { useT, useLocale } from '@/i18n/I18nProvider';
import {
  categoryLabel,
  formatPrice,
  timeAgo,
  typeLabel,
  LISTING_TYPES,
  CONTACT_TYPES,
} from '@/lib/utils';
import { buildItemShareText, clientOrigin } from '@/lib/shareText';
import { ShareButton } from './ShareButton';
import { CopyButton } from './CopyButton';
import { PostModal } from './PostModal';
import { EditCodePrompt } from './EditCodePrompt';
import type { Item } from './ItemCard';
import type { Listing } from './ListingCard';

const LS_LAST_CODE      = 'hb_last_edit_code';
const LS_LAST_CONTACT_V = 'hb_my_contact_value';

type ItemWithStatus = Item & { status: 'active' | 'draft' };

type InboxApplication = {
  id: string;
  applicantGender: string;
  ageRange: string | null;
  contactType: string;
  contactValue: string;
  customContactLabel: string | null;
  message: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejectReason: string | null;
  attachedListingId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListingWithStatus = Listing & {
  status: 'active' | 'draft';
  contactValue: string;
  applications?: InboxApplication[];
};

type SentApplication = {
  id: string;
  listingId: string;
  listing: {
    id: string;
    type: string;
    title: string;
    posterGender: string;
    ageRange: string | null;
    // approved 后才有：
    contactType: string | null;
    contactValue: string | null;
    customContactLabel: string | null;
  };
  message: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type Platform = 'item' | 'listing';
type ItemTab = 'active' | 'draft';
type ListingTab = 'mine' | 'inbox' | 'sent';

const GENDER_LABEL: Record<string, string> = {
  F: '女', M: '男', nb: '非二元', unspecified: '未透露',
};

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:   { label: '待回复', cls: 'bg-amber-100 text-amber-800 border-amber-200',   icon: <Clock size={11} /> },
  approved:  { label: '已同意', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <Check size={11} /> },
  rejected:  { label: '已婉拒', cls: 'bg-rose-100 text-rose-800 border-rose-200',       icon: <XCircle size={11} /> },
  cancelled: { label: '已撤回', cls: 'bg-stone-100 text-stone-600 border-stone-200',     icon: <X size={11} /> },
};

/**
 * 渲染内容主体（不含 modal 外壳，方便嵌进 modal 或 standalone 页面）
 */
function MyPostsBody({ onClose }: { onClose?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [contactValue, setContactValue] = useState('');
  const [editCode, setEditCode] = useState('');

  // items 状态
  const [items, setItems] = useState<ItemWithStatus[] | null>(null);
  const [itemActiveN, setItemActiveN] = useState(0);
  const [itemDraftN, setItemDraftN] = useState(0);

  // listings 状态
  const [listings, setListings] = useState<ListingWithStatus[] | null>(null);
  const [listingActiveN, setListingActiveN] = useState(0);
  const [listingDraftN, setListingDraftN] = useState(0);
  const [inboxPendingN, setInboxPendingN] = useState(0);

  // 我发的申请（B 视角）
  const [sentApps, setSentApps] = useState<SentApplication[] | null>(null);
  const [sentPendingN, setSentPendingN] = useState(0);

  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState<Platform>('item');
  const [itemTab, setItemTab] = useState<ItemTab>('active');
  const [listingTab, setListingTab] = useState<ListingTab>('mine');
  const [listingStatusTab, setListingStatusTab] = useState<ItemTab>('active'); // 我发的 tab 下的 active/draft

  const [editItem, setEditItem] = useState<Item | null>(null);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);
  const [deleteListing, setDeleteListing] = useState<ListingWithStatus | null>(null);
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
      const [itemsRes, listingsRes, sentRes] = await Promise.all([
        fetch('/api/items/by-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: contactValue.trim(), editCode }),
        }),
        fetch('/api/listings/by-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: contactValue.trim(), editCode, withApplications: true }),
        }),
        fetch('/api/applications/by-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: contactValue.trim(), editCode }),
        }),
      ]);

      const itemsData    = await itemsRes.json();
      const listingsData = await listingsRes.json();
      const sentData     = await sentRes.json();

      if (!itemsRes.ok) {
        alert(itemsData.error || t('my.errLookup'));
        return;
      }

      const itemsArr    = (itemsData.items    ?? []) as ItemWithStatus[];
      const listingsArr = (listingsData.items ?? []) as ListingWithStatus[];
      const sentArr     = (sentData.items     ?? []) as SentApplication[];
      setItems(itemsArr);
      setListings(listingsArr);
      setSentApps(sentArr);
      setItemActiveN(itemsData.activeCount ?? 0);
      setItemDraftN(itemsData.draftCount  ?? 0);
      setListingActiveN(listingsData.activeCount ?? 0);
      setListingDraftN(listingsData.draftCount  ?? 0);
      setInboxPendingN(listingsData.pendingApplicationCount ?? 0);
      setSentPendingN(sentData.counts?.pending ?? 0);

      // 平台自动选择：哪个有内容就选哪个，item 优先
      const itemHas    = itemsArr.length > 0;
      const listingHas = listingsArr.length > 0 || sentArr.length > 0;
      const nextPlatform: Platform = itemHas ? 'item' : (listingHas ? 'listing' : 'item');
      setPlatform(nextPlatform);

      // 子 tab 自动选择
      if (nextPlatform === 'item') {
        setItemTab((itemsData.draftCount ?? 0) > 0 ? 'draft' : 'active');
      } else {
        // 待处理 inbox > 我发的待处理 > 我的 listing > 我发的申请
        if ((listingsData.pendingApplicationCount ?? 0) > 0) setListingTab('inbox');
        else if ((sentData.counts?.pending ?? 0) > 0) setListingTab('sent');
        else if (listingsArr.length > 0) setListingTab('mine');
        else if (sentArr.length > 0) setListingTab('sent');
        else setListingTab('mine');
        setListingStatusTab(
          (listingsData.draftCount ?? 0) > 0 && (listingsData.activeCount ?? 0) === 0 ? 'draft' : 'active'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [contactValue, editCode, t]);

  const handlePublishItem = async (item: Item) => {
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

  const handleDeleteItem = async (code: string, item: Item) => {
    const res = await fetch(`/api/items/${item.id}?editCode=${encodeURIComponent(code)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { alert(data.error || '删除失败'); return; }
    setDeleteItem(null);
    await lookup();
  };

  const handlePublishListing = async (listing: ListingWithStatus) => {
    if (editCode.length < 6) { alert('需要识别码'); return; }
    const res = await fetch(`/api/listings/${listing.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editCode }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || '发布失败'); return; }
    await lookup();
  };

  const handleDeleteListing = async (code: string, listing: ListingWithStatus) => {
    const res = await fetch(`/api/listings/${listing.id}?editCode=${encodeURIComponent(code)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { alert(data.error || '删除失败'); return; }
    setDeleteListing(null);
    await lookup();
  };

  const handleApplicationAction = async (
    appId: string,
    action: 'approve' | 'reject' | 'cancel',
    rejectReason?: string,
  ) => {
    if (editCode.length < 6) { alert('需要识别码'); return; }
    const body: any = { action };
    if (action === 'approve' || action === 'reject') {
      body.listingEditCode = editCode;
      if (action === 'reject' && rejectReason) body.rejectReason = rejectReason;
    } else if (action === 'cancel') {
      body.applicantEditCode = editCode;
    }
    const res = await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || '操作失败'); return; }
    await lookup();
  };

  const hasLookedUp = items !== null || listings !== null || sentApps !== null;

  // 当前平台的列表 / 计数
  const visibleItems = (items ?? []).filter(it => it.status === itemTab);
  const visibleListings = (listings ?? []).filter(l => l.status === listingStatusTab);
  const inboxApps: Array<InboxApplication & { listingTitle: string; listingType: string; listingId: string }> = [];
  (listings ?? []).forEach(l => {
    (l.applications ?? []).forEach(a => {
      inboxApps.push({ ...a, listingTitle: l.title, listingType: l.type, listingId: l.id });
    });
  });
  inboxApps.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
      {hasLookedUp && (
        <>
          {/* 平台 tab（外层） */}
          <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
            <PlatformTab
              active={platform === 'item'}
              icon={<ShoppingBag size={14} />}
              label="买卖二手"
              count={itemActiveN + itemDraftN}
              onClick={() => setPlatform('item')}
            />
            <PlatformTab
              active={platform === 'listing'}
              icon={<Home size={14} />}
              label="找室友 & 租房"
              count={listingActiveN + listingDraftN + (sentApps?.length ?? 0)}
              badge={inboxPendingN + sentPendingN}
              onClick={() => setPlatform('listing')}
            />
          </div>

          {/* === 买卖二手平台 === */}
          {platform === 'item' && (
            <>
              <div className="flex gap-0 border-b border-stone-200 mb-3">
                <TabBtn active={itemTab === 'active'} onClick={() => setItemTab('active')}>
                  {t('my.tabActive', { n: itemActiveN })}
                </TabBtn>
                <TabBtn active={itemTab === 'draft'} onClick={() => setItemTab('draft')}>
                  {t('my.tabDraft', { n: itemDraftN })}
                </TabBtn>
              </div>

              {visibleItems.length === 0 ? (
                <div className="text-center text-stone-500 py-12 text-sm">
                  {itemTab === 'draft' ? t('my.draftEmpty') : t('my.empty')}
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
                      onDelete={() => setDeleteItem(item)}
                      onPublish={() => handlePublishItem(item)}
                      isDraft={item.status === 'draft'}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* === 找室友&租房平台 === */}
          {platform === 'listing' && (
            <>
              <div className="flex gap-0 border-b border-stone-200 mb-3">
                <TabBtn active={listingTab === 'mine'} onClick={() => setListingTab('mine')}>
                  我发的 ({listingActiveN + listingDraftN})
                </TabBtn>
                <TabBtn
                  active={listingTab === 'inbox'}
                  onClick={() => setListingTab('inbox')}
                  badge={inboxPendingN}
                >
                  <Inbox size={13} className="inline mr-1" />
                  申请收件 ({inboxApps.length})
                </TabBtn>
                <TabBtn
                  active={listingTab === 'sent'}
                  onClick={() => setListingTab('sent')}
                  badge={sentPendingN}
                >
                  <Send size={13} className="inline mr-1" />
                  我发的申请 ({sentApps?.length ?? 0})
                </TabBtn>
              </div>

              {/* 我发的 listing */}
              {listingTab === 'mine' && (
                <>
                  <div className="flex gap-1.5 mb-3 text-xs text-stone-600">
                    <SubChip
                      active={listingStatusTab === 'active'}
                      onClick={() => setListingStatusTab('active')}
                    >
                      发布中 ({listingActiveN})
                    </SubChip>
                    <SubChip
                      active={listingStatusTab === 'draft'}
                      onClick={() => setListingStatusTab('draft')}
                    >
                      草稿 ({listingDraftN})
                    </SubChip>
                  </div>

                  {visibleListings.length === 0 ? (
                    <div className="text-center text-stone-500 py-12 text-sm">
                      {listingStatusTab === 'draft'
                        ? '没有草稿。'
                        : '还没有发布 listing。去 /roommates 发布第一个吧。'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {visibleListings.map(listing => (
                        <MyListingRow
                          key={listing.id}
                          listing={listing}
                          locale={locale}
                          onDelete={() => setDeleteListing(listing)}
                          onPublish={() => handlePublishListing(listing)}
                          isDraft={listing.status === 'draft'}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* 申请收件（A 视角） */}
              {listingTab === 'inbox' && (
                <>
                  {inboxApps.length === 0 ? (
                    <div className="text-center text-stone-500 py-12 text-sm">
                      暂时没有人申请你的 listing。<br />
                      <span className="text-xs text-stone-400">
                        新申请会在这里显示，pending 状态有红点提示
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {inboxApps.map(app => (
                        <InboxRow
                          key={app.id}
                          app={app}
                          onApprove={() => handleApplicationAction(app.id, 'approve')}
                          onReject={(reason) => handleApplicationAction(app.id, 'reject', reason)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* 我发的申请（B 视角） */}
              {listingTab === 'sent' && (
                <>
                  {(!sentApps || sentApps.length === 0) ? (
                    <div className="text-center text-stone-500 py-12 text-sm">
                      你还没申请过别人的 listing。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sentApps.map(app => (
                        <SentRow
                          key={app.id}
                          app={app}
                          onCancel={() => handleApplicationAction(app.id, 'cancel')}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* 编辑模态框（仅 item） */}
      {editItem && (
        <PostModal
          mode="edit"
          initialItem={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); lookup(); }}
        />
      )}

      {/* 删除识别码确认 —— item */}
      {deleteItem && (
        <EditCodePrompt
          itemId={deleteItem.id}
          title={deleteItem.title}
          action={t('code.actionDelete')}
          onCancel={() => setDeleteItem(null)}
          onConfirm={async (code) => {
            if (!confirm(t('code.confirmDelete'))) return;
            await handleDeleteItem(code, deleteItem);
          }}
        />
      )}

      {/* 删除识别码确认 —— listing */}
      {deleteListing && (
        <EditCodePrompt
          itemId={deleteListing.id}
          title={deleteListing.title}
          action="删除"
          onCancel={() => setDeleteListing(null)}
          onConfirm={async (code) => {
            if (!confirm('删除后无法恢复，确定？')) return;
            await handleDeleteListing(code, deleteListing);
          }}
        />
      )}
    </>
  );
}

/**
 * 主页 inline 用：modal 外壳 + 内容
 */
export function MyPostsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();

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
 * /my 路由的兼容落地页：不带 modal 外壳
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
  item, locale, origin, isDraft, onEdit, onDelete, onPublish, t,
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

function MyListingRow({
  listing, locale, isDraft, onDelete, onPublish,
}: {
  listing: ListingWithStatus;
  locale: 'zh' | 'en';
  isDraft: boolean;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const photos = listing.photoUrls;
  const typeMeta = LISTING_TYPES.find(t => t.id === listing.type);
  const pendingN = (listing.applications ?? []).filter(a => a.status === 'pending').length;

  const budgetText = (() => {
    const { budgetMin: a, budgetMax: b } = listing;
    if (a === null && b === null) return '面议';
    if (a !== null && b !== null && a === b) return `$${a}/月`;
    if (a !== null && b !== null) return `$${a}–${b}/月`;
    if (a !== null) return `$${a}+/月`;
    return `≤$${b}/月`;
  })();

  return (
    <div className={`bg-white border rounded-lg p-3 flex gap-3 ${isDraft ? 'border-amber-300 bg-amber-50/30' : 'border-stone-200'}`}>
      {photos.length > 0 ? (
        <NextImage
          src={photos[0]}
          alt=""
          width={72}
          height={72}
          sizes="72px"
          className="h-18 w-18 sm:h-20 sm:w-20 object-cover rounded flex-shrink-0"
        />
      ) : (
        <div className="h-18 w-18 sm:h-20 sm:w-20 rounded flex-shrink-0 bg-stone-100 flex items-center justify-center text-stone-300">
          <Home size={28} strokeWidth={1.2} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs mb-1 flex-wrap">
          {isDraft && <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-semibold">草稿</span>}
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {typeMeta?.label ?? listing.type}
          </span>
          {listing.housingLayout && (
            <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
              {listing.housingLayout}
            </span>
          )}
          {pendingN > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-0.5">
              <Inbox size={11} />
              {pendingN} 待回复
            </span>
          )}
          <span className="text-stone-400 ml-auto">{timeAgo(listing.createdAt, locale)}</span>
        </div>

        <div className="font-medium text-stone-900 truncate">{listing.title}</div>
        <div className="text-brand font-bold mb-1">{budgetText}</div>

        <div className="flex items-center gap-3 text-xs text-stone-500 mb-2 flex-wrap">
          {(listing.moveInStart || listing.moveInEnd) && (
            <span className="inline-flex items-center gap-1">
              <Calendar size={11} />
              {formatDateRangeShort(listing.moveInStart, listing.moveInEnd)}
            </span>
          )}
          {listing.areas.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={11} />
              {listing.areas.slice(0, 2).join(' · ')}
              {listing.areas.length > 2 && ` +${listing.areas.length - 2}`}
            </span>
          )}
        </div>

        {listing.description && (
          <div className="text-xs text-stone-600 line-clamp-2 mb-2">{listing.description}</div>
        )}

        <div className="flex gap-2 flex-wrap text-xs">
          {isDraft && (
            <button
              onClick={onPublish}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium transition-colors"
            >
              <CheckCircle2 size={13} />
              发布
            </button>
          )}
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 transition-colors"
          >
            <Trash2 size={13} />
            删除
          </button>
          {!isDraft && (
            <CopyButton text={listing.contactValue} label="复制联系" />
          )}
        </div>
      </div>
    </div>
  );
}

function InboxRow({
  app, onApprove, onReject,
}: {
  app: InboxApplication & { listingTitle: string; listingType: string; listingId: string };
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const sm = STATUS_META[app.status];
  const typeMeta = LISTING_TYPES.find(t => t.id === app.listingType);

  const doApprove = async () => {
    if (!confirm(`同意后，对方能看到你的联系方式。确定？`)) return;
    setBusy(true);
    try { await onApprove(); } finally { setBusy(false); }
  };
  const doReject = async () => {
    setBusy(true);
    try { await onReject(rejectReason.trim()); setShowRejectInput(false); } finally { setBusy(false); }
  };

  return (
    <div className={`bg-white border rounded-lg p-3 ${app.status === 'pending' ? 'border-amber-300' : 'border-stone-200'}`}>
      <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${sm.cls}`}>
          {sm.icon}{sm.label}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          {typeMeta?.label ?? app.listingType}
        </span>
        <span className="text-stone-500 truncate max-w-[14rem]">→ {app.listingTitle}</span>
        <span className="text-stone-400 ml-auto">{timeAgo(app.createdAt, 'zh')}</span>
      </div>

      <div className="text-sm text-stone-700 mb-2">
        <span className="font-medium">
          {GENDER_LABEL[app.applicantGender] ?? app.applicantGender}
          {app.ageRange && ` · ${app.ageRange}`}
        </span>
        <span className="text-stone-400 mx-1.5">说：</span>
      </div>
      <div className="text-sm text-stone-700 mb-2 whitespace-pre-wrap bg-stone-50 border border-stone-200 rounded p-2.5 leading-relaxed">
        {app.message}
      </div>

      {app.attachedListingId && (
        <div className="text-xs text-stone-500 mb-2 inline-flex items-center gap-1">
          <span>📎 对方附了自己的 listing：</span>
          <a href={`/roommates#listing-${app.attachedListingId}`} className="text-brand hover:underline">查看</a>
        </div>
      )}

      {app.status === 'approved' && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-2">
          ✓ 你已同意。对方联系方式：
          <ContactLine type={app.contactType} value={app.contactValue} customLabel={app.customContactLabel} />
        </div>
      )}

      {app.status === 'rejected' && app.rejectReason && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 mb-2">
          婉拒理由：{app.rejectReason}
        </div>
      )}

      {/* 操作按钮：仅 pending 显示 */}
      {app.status === 'pending' && !showRejectInput && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={doApprove}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
          >
            <Check size={14} />同意（暴露联系方式）
          </button>
          <button
            onClick={() => setShowRejectInput(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-sm disabled:opacity-50"
          >
            <XCircle size={14} />婉拒
          </button>
        </div>
      )}

      {showRejectInput && (
        <div className="mt-2 space-y-2">
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="（可选）简短说明，对方能看到"
            className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={doReject}
              disabled={busy}
              className="px-3 py-1.5 rounded bg-rose-600 text-white hover:bg-rose-700 text-sm font-medium disabled:opacity-50"
            >
              确认婉拒
            </button>
            <button
              onClick={() => { setShowRejectInput(false); setRejectReason(''); }}
              className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SentRow({
  app, onCancel,
}: {
  app: SentApplication;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const sm = STATUS_META[app.status];
  const typeMeta = LISTING_TYPES.find(t => t.id === app.listing.type);

  const doCancel = async () => {
    if (!confirm('撤回后无法恢复，确定？')) return;
    setBusy(true);
    try { await onCancel(); } finally { setBusy(false); }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-3">
      <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${sm.cls}`}>
          {sm.icon}{sm.label}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          {typeMeta?.label ?? app.listing.type}
        </span>
        <span className="text-stone-500 truncate max-w-[14rem]">→ {app.listing.title}</span>
        <span className="text-stone-400 ml-auto">{timeAgo(app.createdAt, 'zh')}</span>
      </div>

      <div className="text-xs text-stone-500 mb-1">对方：
        {GENDER_LABEL[app.listing.posterGender] ?? app.listing.posterGender}
        {app.listing.ageRange && ` · ${app.listing.ageRange}`}
      </div>

      <div className="text-sm text-stone-700 mb-2 whitespace-pre-wrap bg-stone-50 border border-stone-200 rounded p-2.5 leading-relaxed">
        {app.message}
      </div>

      {app.status === 'approved' && app.listing.contactValue && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-2">
          ✓ 对方已同意。联系方式：
          <ContactLine type={app.listing.contactType} value={app.listing.contactValue} customLabel={app.listing.customContactLabel} />
        </div>
      )}

      {app.status === 'rejected' && app.rejectReason && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 mb-2">
          对方说：{app.rejectReason}
        </div>
      )}

      {app.status === 'pending' && (
        <button
          onClick={doCancel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-sm disabled:opacity-50"
        >
          <X size={14} />撤回申请
        </button>
      )}
    </div>
  );
}

function ContactLine({
  type, value, customLabel,
}: {
  type: string | null;
  value: string | null;
  customLabel: string | null;
}) {
  if (!value) return null;
  const ct = CONTACT_TYPES.find(c => c.id === type);
  const label = type === 'other' ? (customLabel || '其他') : (
    type === 'wechat' ? '微信' :
    type === 'phone'  ? '手机' :
    type === 'email'  ? '邮箱' :
    type ?? ''
  );
  return (
    <span className="ml-1.5 inline-flex items-center gap-1.5">
      <span className="font-medium">{label}:</span>
      <span className="font-mono select-all">{value}</span>
      <CopyButton text={value} label="复制" />
    </span>
  );
}

function formatDateRangeShort(s: string | null, e: string | null): string {
  if (!s && !e) return '';
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  if (s && e) return `${fmt(s)}–${fmt(e)}`;
  if (s) return `${fmt(s)} 起`;
  return `至 ${fmt(e!)}`;
}

function PlatformTab({
  active, icon, label, count, badge, onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 px-3 py-2 rounded-chip text-sm whitespace-nowrap border transition-colors ${
        active
          ? 'bg-brand text-white border-brand font-medium shadow-card'
          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
        active ? 'bg-white/20' : 'bg-stone-100 text-stone-600'
      }`}>
        {count}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function TabBtn({
  active, children, onClick, badge,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2 text-sm border-b-2 -mb-px ${
        active
          ? 'border-brand text-brand font-semibold'
          : 'border-transparent text-stone-500 hover:text-stone-800'
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-1 right-0 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function SubChip({
  active, children, onClick,
}: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-chip border transition-colors ${
        active
          ? 'bg-brand/10 border-brand text-brand font-medium'
          : 'bg-white border-stone-300 text-stone-600 hover:bg-stone-100'
      }`}
    >
      {children}
    </button>
  );
}
