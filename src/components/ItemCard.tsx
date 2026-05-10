'use client';

import { useState, useEffect } from 'react';
import { CopyButton } from './CopyButton';
import { InquirySection } from './InquirySection';
import {
  categoryLabel,
  contactTypeLabel,
  formatPrice,
  itemCopyText,
  timeAgo,
} from '@/lib/utils';
import { useT, useLocale } from '@/i18n/I18nProvider';

export type Item = {
  id: string;
  type: 'sell' | 'buy';
  title: string;
  description: string;
  price: number | null;
  category: string;
  customTag: string | null;
  contactType: string;
  contactValue: string;
  customContactLabel: string | null;
  photoUrls: string[];
  createdAt: string;
  inquiries: any[];
};

export function ItemCard({
  item,
  onEdit,
  onMarkSold,
  onReport,
  onDeleteInquiryAsSeller,
  refresh,
}: {
  item: Item;
  onEdit: (item: Item) => void;
  onMarkSold: (item: Item) => void;
  onReport: (item: Item) => void;
  onDeleteInquiryAsSeller: (item: Item, inquiryId: string) => void;
  refresh: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const photos = item.photoUrls;

  // 键盘左右切换 + Esc 关闭
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

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomIdx(i => i === null ? null : (i - 1 + photos.length) % photos.length);
  };
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomIdx(i => i === null ? null : (i + 1) % photos.length);
  };

  const truncated = item.title.length > 12 ? item.title.slice(0, 12) + '…' : item.title;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-stone-200 p-4 hover:shadow-md transition-shadow">
      {/* 标签行 */}
      <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded-full font-medium ${
          item.type === 'sell'
            ? 'bg-brand text-white'
            : 'bg-accent text-white'
        }`}>
          {item.type === 'sell' ? t('type.sell') : t('type.buy')}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
          {categoryLabel(item.category, locale)}
          {item.customTag && ` · ${item.customTag}`}
        </span>
        <span className="text-stone-400 ml-auto">{timeAgo(item.createdAt, locale)}</span>
      </div>

      {/* 标题 + 价格 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-lg font-semibold text-stone-900 leading-tight">
          {item.title}
        </h3>
        <span className="text-xl font-bold text-brand whitespace-nowrap">
          {formatPrice(item.price, locale, item.type)}
        </span>
      </div>

      {/* 描述 */}
      {item.description && (
        <p className="text-sm text-stone-700 mb-3 whitespace-pre-wrap">
          {item.description}
        </p>
      )}

      {/* 图片缩略图 — 点击在当前页弹大图 */}
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3 pb-1">
          {photos.map((url, i) => (
            <button
              key={i}
              onClick={() => setZoomIdx(i)}
              className="flex-shrink-0 relative group"
              aria-label={t('card.viewPhoto', { i: i + 1, n: photos.length })}
            >
              <img
                src={url}
                alt={`${item.title} ${i + 1}`}
                className="h-24 w-24 object-cover rounded border border-stone-200 group-hover:border-brand transition-colors"
                loading="lazy"
              />
              {i === 0 && photos.length > 1 && (
                <span className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                  {t('card.photoCount', { n: photos.length })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 联系方式 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-sm text-stone-600">
          {contactTypeLabel(item.contactType, item.customContactLabel, locale)}：
        </span>
        <span className="text-sm font-mono text-stone-900 select-all">
          {item.contactValue}
        </span>
        <CopyButton text={item.contactValue} label={t('card.copyContact')} />
      </div>

      {/* 操作按钮组 */}
      <div className="flex gap-2 flex-wrap text-xs">
        <CopyButton
          text={itemCopyText(item.title, item.price, item.type)}
          label={t('card.copyTitle', { title: truncated, price: formatPrice(item.price, locale, item.type) })}
          size="md"
          className="!bg-amber-50 !border-amber-300 hover:!bg-amber-100"
        />
        <button
          onClick={() => onEdit(item)}
          className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-sm"
        >
          {t('card.edit')}
        </button>
        <button
          onClick={() => onMarkSold(item)}
          className="px-3 py-1.5 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 text-sm"
        >
          {t('card.markSold')}
        </button>
        <button
          onClick={() => onReport(item)}
          className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-sm text-stone-500"
        >
          {t('card.report')}
        </button>
      </div>

      {/* 询价区 */}
      <InquirySection
        itemId={item.id}
        inquiries={item.inquiries}
        onInquiryAdded={refresh}
        onInquiryDeleted={refresh}
        onInquiryUpdated={refresh}
        onRequestSellerDelete={(inqId) => onDeleteInquiryAsSeller(item, inqId)}
      />

      {/* 大图 lightbox */}
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
            className="absolute top-3 right-4 text-white text-4xl leading-none w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10"
            onClick={(e) => { e.stopPropagation(); setZoomIdx(null); }}
            aria-label={t('lightbox.close')}
          >×</button>

          {photos.length > 1 && (
            <button
              onClick={goPrev}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white text-3xl w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/70"
              aria-label={t('lightbox.prev')}
            >‹</button>
          )}

          <img
            src={photos[zoomIdx]}
            className="max-h-full max-w-full object-contain"
            alt={`${item.title} ${zoomIdx + 1}`}
            onClick={(e) => e.stopPropagation()}
          />

          {photos.length > 1 && (
            <button
              onClick={goNext}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white text-3xl w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/70"
              aria-label={t('lightbox.next')}
            >›</button>
          )}

          {photos.length > 1 && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/40 p-2 rounded-lg max-w-[90vw] overflow-x-auto no-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              {photos.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setZoomIdx(i)}
                  className={`flex-shrink-0 ${i === zoomIdx ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'}`}
                >
                  <img src={url} alt="" className="h-12 w-12 object-cover rounded" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
