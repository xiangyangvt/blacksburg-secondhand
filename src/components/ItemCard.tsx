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
  typeLabel,
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
  // 手机端：···菜单开关（编辑/售出/举报这些低频操作）
  const [showAdmin, setShowAdmin] = useState(false);
  // 询价区展开时，整张卡片在手机端横跨两列变全宽，留言/回复有更舒服的宽度
  const [inquiryOpen, setInquiryOpen] = useState(false);
  // 用户点卡片任意空白处 → 展开成全宽 + 显示描述/时间
  const [expanded, setExpanded] = useState(false);
  const photos = item.photoUrls;
  const fullWidth = expanded || inquiryOpen;

  // 点卡片切换展开 — 但点按钮/链接/输入时不触发
  const onCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, label')) return;
    setExpanded(v => !v);
  };

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

  const AdminButtons = (
    <>
      <button
        onClick={() => onEdit(item)}
        className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-xs"
      >
        {t('card.edit')}
      </button>
      <button
        onClick={() => onMarkSold(item)}
        className="px-3 py-1.5 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 text-xs"
      >
        {t('card.markSold')}
      </button>
      <button
        onClick={() => onReport(item)}
        className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-xs text-stone-500"
      >
        {t('card.report')}
      </button>
    </>
  );

  return (
    <div
      onClick={onCardClick}
      className={`bg-white rounded-lg shadow-sm border ${expanded ? 'border-brand/40' : 'border-stone-200'} p-3 md:p-4 hover:shadow-md transition-all cursor-pointer ${fullWidth ? 'col-span-2 md:col-span-1' : ''}`}
    >
      {/* === 图片：手机端封面图（正方形）/ 桌面端缩略图横排 === */}
      {photos.length > 0 && (
        <>
          {/* Mobile：只显示第一张作为封面，点击进 lightbox */}
          <button
            onClick={() => setZoomIdx(0)}
            className="md:hidden block w-full aspect-square mb-2 relative overflow-hidden rounded"
            aria-label={t('card.viewPhoto', { i: 1, n: photos.length })}
          >
            <img
              src={photos[0]}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {photos.length > 1 && (
              <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                {t('card.photoCount', { n: photos.length })}
              </span>
            )}
          </button>

          {/* Desktop：完整缩略图横排 */}
          <div className="hidden md:flex gap-2 overflow-x-auto no-scrollbar mb-3 pb-1">
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
        </>
      )}

      {/* === 标签行 === */}
      <div className="flex items-center gap-1.5 text-[10px] md:text-xs mb-1.5 flex-wrap">
        <span className={`px-2 py-0.5 rounded-full font-medium ${
          item.type === 'sell' ? 'bg-brand text-white' : 'bg-accent text-white'
        }`}>
          {typeLabel(item.type, item.category, locale)}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 truncate max-w-[100px] md:max-w-none">
          {categoryLabel(item.category, locale)}
          {item.customTag && ` · ${item.customTag}`}
        </span>
        {/* 时间：默认手机端隐藏；展开后显示 */}
        <span className={`text-stone-400 ml-auto ${expanded ? 'inline' : 'hidden md:inline'}`}>
          {timeAgo(item.createdAt, locale)}
        </span>
      </div>

      {/* === 标题 + 价格 === */}
      <div className="mb-2">
        <h3 className="text-base md:text-lg font-semibold text-stone-900 leading-tight line-clamp-2">
          {item.title}
        </h3>
        <div className="text-lg md:text-xl font-bold text-brand mt-0.5">
          {formatPrice(item.price, locale, item.type, item.category)}
        </div>
      </div>

      {/* === 描述：默认手机隐藏；点卡片展开后显示 === */}
      {item.description && (
        <p className={`text-sm text-stone-700 mb-3 whitespace-pre-wrap ${expanded ? 'block' : 'hidden md:block'}`}>
          {item.description}
        </p>
      )}

      {/* === 联系方式 === */}
      <div className="flex items-center gap-1.5 mb-2 text-xs md:text-sm flex-wrap">
        <span className="text-stone-600 truncate min-w-0">
          {contactTypeLabel(item.contactType, item.customContactLabel, locale)}：
          <span className="font-mono text-stone-900 select-all ml-1">{item.contactValue}</span>
        </span>
        <CopyButton text={item.contactValue} label="📋" />
      </div>

      {/* === 复制 标题—价格（最常用） === */}
      <CopyButton
        text={itemCopyText(item.title, item.price, item.type, item.category)}
        label={t('card.copyTitle')}
        size="md"
        className="!w-full !block !text-center !bg-amber-50 !border-amber-300 hover:!bg-amber-100"
      />

      {/* === 桌面端：编辑/售出/举报常驻 === */}
      <div className="hidden md:flex gap-2 flex-wrap text-xs mt-3">
        {AdminButtons}
      </div>

      {/* === 手机端：低频操作收进 ··· === */}
      <div className="md:hidden mt-2">
        <button
          onClick={() => setShowAdmin(s => !s)}
          className="w-full text-stone-400 hover:text-stone-600 text-sm py-1 flex items-center justify-center gap-1"
          aria-label="更多操作"
        >
          {showAdmin ? '▴ 收起' : '··· 更多'}
        </button>
        {showAdmin && (
          <div className="flex gap-1.5 flex-wrap mt-1 justify-center">
            {AdminButtons}
          </div>
        )}
      </div>

      {/* === 询价区（已折叠） === */}
      <InquirySection
        itemId={item.id}
        inquiries={item.inquiries}
        onInquiryAdded={refresh}
        onInquiryDeleted={refresh}
        onInquiryUpdated={refresh}
        onRequestSellerDelete={(inqId) => onDeleteInquiryAsSeller(item, inqId)}
        onOpenChange={setInquiryOpen}
      />

      {/* === 大图 lightbox === */}
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
