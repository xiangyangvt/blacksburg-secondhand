'use client';

// 单商品 detail 页的渲染主体（client 组件，因为含 lightbox、share、inquiry 等交互）
// 由 /app/item/[id]/page.tsx (RSC) 拉数据后传进来

import { useState, useEffect } from 'react';
import NextImage from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, X, Flag, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { ShareButton } from './ShareButton';
import { InquirySection } from './InquirySection';
import { EditCodePrompt } from './EditCodePrompt';
import {
  categoryLabel,
  contactTypeLabel,
  formatPrice,
  itemCopyText,
  timeAgo,
  typeLabel,
} from '@/lib/utils';
import { buildItemShareText, clientOrigin } from '@/lib/shareText';
import { useT, useLocale } from '@/i18n/I18nProvider';
import type { Item } from './ItemCard';

export function ItemDetailView({ item }: { item: Item }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const photos = item.photoUrls;
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const [mainIdx, setMainIdx] = useState(0);
  const [codePrompt, setCodePrompt] = useState<'delete' | { kind: 'sellerDelInq'; inquiryId: string } | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(clientOrigin()); }, []);

  // Lightbox 键盘控制
  useEffect(() => {
    if (zoomIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomIdx(null);
      if (e.key === 'ArrowLeft')  setZoomIdx(i => i === null ? null : (i - 1 + photos.length) % photos.length);
      if (e.key === 'ArrowRight') setZoomIdx(i => i === null ? null : (i + 1) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [zoomIdx, photos.length]);

  const refresh = () => router.refresh();

  const handleDelete = async (code: string) => {
    const res = await fetch(`/api/items/${item.id}?editCode=${encodeURIComponent(code)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { alert(data.error || t('inq.errDelete')); return; }
    setCodePrompt(null);
    router.replace('/');
  };

  const handleSellerDeleteInquiry = async (code: string, inquiryId: string) => {
    const res = await fetch(
      `/api/inquiries/${inquiryId}?itemEditCode=${encodeURIComponent(code)}`,
      { method: 'DELETE' },
    );
    const data = await res.json();
    if (!res.ok) { alert(data.error || t('inq.errDelete')); return; }
    setCodePrompt(null);
    refresh();
  };

  const handleReport = async () => {
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

  const shareText = origin
    ? buildItemShareText({
        title: item.title,
        price: item.price,
        itemType: item.type,
        category: item.category,
        origin,
        itemId: item.id,
      })
    : itemCopyText(item.title, item.price, item.type, item.category);

  return (
    <main className="min-h-screen bg-stone-50">
      {/* 顶栏：回首页 + 站名 */}
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-brand whitespace-nowrap"
          >
            <ArrowLeft size={16} />
            <span>回到首页</span>
          </Link>
          <h1 className="text-base font-bold text-stone-900 tracking-tight truncate ml-auto">
            黑堡<span className="text-brand">二手</span>
          </h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-3 md:px-4 py-4">
        <article className="bg-white rounded-lg border border-stone-200 overflow-hidden">
          {/* === 大图区 === */}
          {photos.length > 0 && (
            <div className="bg-stone-100">
              <button
                onClick={() => setZoomIdx(mainIdx)}
                className="block w-full aspect-square md:aspect-[4/3] relative overflow-hidden"
                aria-label={t('card.viewPhoto', { i: mainIdx + 1, n: photos.length })}
              >
                <NextImage
                  src={photos[mainIdx]}
                  alt={item.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 768px"
                  priority
                  className="object-contain"
                />
              </button>
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-2 bg-white border-t border-stone-100">
                  {photos.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setMainIdx(i)}
                      className={`flex-shrink-0 relative ${i === mainIdx ? 'ring-2 ring-brand' : 'opacity-70 hover:opacity-100'}`}
                      aria-label={t('card.viewPhoto', { i: i + 1, n: photos.length })}
                    >
                      <NextImage
                        src={url}
                        alt={`${item.title} ${i + 1}`}
                        width={64}
                        height={64}
                        sizes="64px"
                        className="h-16 w-16 object-cover rounded"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* === 信息区 === */}
          <div className="p-4 md:p-5">
            {/* 标签行 */}
            <div className="flex items-center gap-1.5 text-xs mb-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full font-medium ${
                item.type === 'sell' ? 'bg-brand text-white' : 'bg-accent text-white'
              }`}>
                {typeLabel(item.type, item.category, locale)}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                {categoryLabel(item.category, locale)}
                {item.customTag && ` · ${item.customTag}`}
              </span>
              <span className="text-stone-400 ml-auto">
                {timeAgo(item.createdAt, locale)}
              </span>
            </div>

            {/* 标题 + 价格 */}
            <h2 className="text-xl md:text-2xl font-bold text-stone-900 leading-tight mb-1">
              {item.title}
            </h2>
            <div className="text-2xl md:text-3xl font-bold text-brand mb-4">
              {formatPrice(item.price, locale, item.type, item.category)}
            </div>

            {/* 描述 */}
            {item.description && (
              <p className="text-sm md:text-base text-stone-700 whitespace-pre-wrap mb-4">
                {item.description}
              </p>
            )}

            {/* 联系方式 */}
            <div className="bg-stone-50 border border-stone-200 rounded p-3 mb-4">
              <div className="text-xs text-stone-500 mb-1">{t('card.copyContact')}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm md:text-base">
                  {contactTypeLabel(item.contactType, item.customContactLabel, locale)}：
                  <span className="font-mono text-stone-900 select-all ml-1">{item.contactValue}</span>
                </span>
                <CopyButton text={item.contactValue} />
              </div>
            </div>

            {/* 操作按钮：复制/分享（含链接）+ 举报 + 卖家删除 */}
            <div className="flex gap-2 flex-wrap mb-3">
              <ShareButton
                shareText={shareText}
                label={t('card.shareItem')}
                className="!bg-amber-50 !border-amber-300 hover:!bg-amber-100"
              />
              <button
                onClick={handleReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-xs text-stone-700 transition-colors"
              >
                <Flag size={13} />
                {t('card.report')}
              </button>
              {/* 卖家入口：识别码删除（编辑请回首页 / 我的发布） */}
              <button
                onClick={() => setCodePrompt('delete')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-xs text-stone-700 ml-auto transition-colors"
              >
                <Trash2 size={13} />
                {t('card.markSold')}
              </button>
            </div>
          </div>

          {/* === 询价区 === */}
          <div className="border-t border-stone-200 p-4 md:p-5">
            <InquirySection
              itemId={item.id}
              inquiries={item.inquiries}
              open={true}
              onToggle={() => { /* detail 页询价区永远展开 */ }}
              onInquiryAdded={refresh}
              onInquiryDeleted={refresh}
              onInquiryUpdated={refresh}
              onRequestSellerDelete={(inquiryId) => setCodePrompt({ kind: 'sellerDelInq', inquiryId })}
            />
          </div>
        </article>
      </div>

      {/* Lightbox */}
      {zoomIdx !== null && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 cursor-pointer select-none"
          onClick={() => setZoomIdx(null)}
        >
          {photos.length > 1 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/60 px-3 py-1 rounded-full">
              {zoomIdx + 1} / {photos.length}
            </div>
          )}
          <button
            className="absolute top-3 right-4 text-white w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            onClick={(e) => { e.stopPropagation(); setZoomIdx(null); }}
            aria-label={t('lightbox.close')}
          ><X size={24} /></button>
          {photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setZoomIdx(i => i === null ? null : (i - 1 + photos.length) % photos.length); }}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/70 transition-colors"
              aria-label={t('lightbox.prev')}
            ><ChevronLeft size={28} /></button>
          )}
          {/* Lightbox 大图用 <img> 而不是 next/image fill —— 避免铺满整屏挡住按钮，
              用户点图后变成"看着卡住、关不掉"的体验 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[zoomIdx]}
            alt={`${item.title} ${zoomIdx + 1}`}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setZoomIdx(i => i === null ? null : (i + 1) % photos.length); }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/70 transition-colors"
              aria-label={t('lightbox.next')}
            ><ChevronRight size={28} /></button>
          )}
        </div>
      )}

      {/* 删除确认 */}
      {codePrompt && (
        <EditCodePrompt
          itemId={item.id}
          title={item.title}
          action={codePrompt === 'delete' ? t('code.actionDelete') : t('code.actionDelInq')}
          onCancel={() => setCodePrompt(null)}
          onConfirm={async (code) => {
            if (codePrompt === 'delete') {
              if (!confirm(t('code.confirmDelete'))) return;
              await handleDelete(code);
            } else {
              await handleSellerDeleteInquiry(code, codePrompt.inquiryId);
            }
          }}
        />
      )}
    </main>
  );
}
