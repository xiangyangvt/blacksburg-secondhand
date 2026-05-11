'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
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
  // 统一的展开状态 —— 三种 click 来源都 toggle 它
  const [expanded, setExpanded] = useState(false);
  const photos = item.photoUrls;
  const cardRef = useRef<HTMLDivElement>(null);

  /**
   * 两种展开来源都 toggle 同一个 expanded 状态：
   *   'card'    → 卡顶端到屏顶（点空白处）
   *   'inquiry' → 第一条留言到屏中央（点 X 条留言）
   */
  const toggleExpand = (target: 'card' | 'inquiry') => {
    setExpanded(prev => {
      const next = !prev;
      if (next) {
        // 双 rAF 等 col-span-2 + 内容渲染都完成
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const card = cardRef.current;
            if (!card) return;
            const opts = { behavior: 'smooth' as const };
            if (target === 'card') {
              card.scrollIntoView({ ...opts, block: 'start' });
            } else {
              const t = card.querySelector('[data-card-section="first-inquiry"]')
                ?? card.querySelector('[data-card-section="inquiry-list"]');
              t?.scrollIntoView({ ...opts, block: 'center' });
            }
          })
        );
      }
      return next;
    });
  };

  // 点卡片空白处 → toggle 展开（点按钮/链接/输入不触发）
  const onCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, label')) return;
    toggleExpand('card');
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

  // 三个 admin 按钮统一中性配色（删除不再用绿）
  const AdminButtons = (
    <>
      <button
        onClick={() => onEdit(item)}
        className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-xs text-stone-700"
      >
        {t('card.edit')}
      </button>
      <button
        onClick={() => onMarkSold(item)}
        className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-xs text-stone-700"
      >
        {t('card.markSold')}
      </button>
      <button
        onClick={() => onReport(item)}
        className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-xs text-stone-700"
      >
        {t('card.report')}
      </button>
    </>
  );

  return (
    <div
      ref={cardRef}
      onClick={onCardClick}
      className={`bg-white rounded-lg shadow-sm border ${expanded ? 'border-brand/40' : 'border-stone-200'} p-3 md:p-4 hover:shadow-md transition-all cursor-pointer scroll-mt-24 ${expanded ? 'col-span-2 md:col-span-1' : ''}`}
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
            <Image
              src={photos[0]}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 50vw, 0"
              className="object-cover"
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
                <Image
                  src={url}
                  alt={`${item.title} ${i + 1}`}
                  width={96}
                  height={96}
                  sizes="96px"
                  className="h-24 w-24 object-cover rounded border border-stone-200 group-hover:border-brand transition-colors"
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

      {/* === 联系方式 + 复制按钮 — 手机端仅展开后显示，桌面常驻 === */}
      <div className={`${expanded ? 'flex' : 'hidden md:flex'} items-center gap-1.5 mb-2 flex-wrap text-xs md:text-sm`}>
        <span className="text-stone-600 truncate min-w-0">
          {contactTypeLabel(item.contactType, item.customContactLabel, locale)}：
          <span className="font-mono text-stone-900 select-all ml-1">{item.contactValue}</span>
        </span>
        <CopyButton text={item.contactValue} />
        <CopyButton
          text={itemCopyText(item.title, item.price, item.type, item.category)}
          label={t('card.copyTitle')}
          size="md"
          className="!bg-amber-50 !border-amber-300 hover:!bg-amber-100"
        />
      </div>

      {/* === 编辑/删除/举报：桌面常驻；手机仅展开后显示，无"更多/收起"按钮 === */}
      <div data-card-section="admin" className="hidden md:flex gap-2 flex-wrap text-xs mt-3">
        {AdminButtons}
      </div>
      {expanded && (
        <div className="md:hidden flex gap-1.5 flex-wrap mt-3 justify-center">
          {AdminButtons}
        </div>
      )}

      {/* === 询价区：受控组件，open 跟 expanded 同步 === */}
      <InquirySection
        itemId={item.id}
        inquiries={item.inquiries}
        open={expanded}
        onToggle={() => toggleExpand('inquiry')}
        onInquiryAdded={refresh}
        onInquiryDeleted={refresh}
        onInquiryUpdated={refresh}
        onRequestSellerDelete={(inqId) => onDeleteInquiryAsSeller(item, inqId)}
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

          <div
            className="relative w-full h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={photos[zoomIdx]}
              alt={`${item.title} ${zoomIdx + 1}`}
              fill
              sizes="100vw"
              priority
              className="object-contain"
            />
          </div>

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
                  <Image
                    src={url}
                    alt=""
                    width={48}
                    height={48}
                    sizes="48px"
                    className="h-12 w-12 object-cover rounded"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
