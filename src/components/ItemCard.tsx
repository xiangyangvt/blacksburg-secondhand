'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { Pencil, Trash2, Flag, X, ChevronLeft, ChevronRight, Eye, Heart, Check, ExternalLink } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { ShareButton } from './ShareButton';
import { InquirySection } from './InquirySection';
import { MoreMenu } from './MoreMenu';
import { buildItemShareText, clientOrigin } from '@/lib/shareText';
import { markRecentView } from '@/lib/recentViews';
import { addToCart, removeFromCart, isInCart, subscribeCart } from '@/lib/shoppingCart';
import {
  categoryLabel,
  contactTypeLabel,
  formatPrice,
  typeLabel,
  categoryDotClass,
  categoryBgClass,
  freshnessBadge,
} from '@/lib/utils';
import { useT, useLocale } from '@/i18n/I18nProvider';
import { showError, showSuccess, showWarning } from '@/lib/toast';
import { showSameSellerToast, type SameSellerItem } from './SameSellerToast';

export type Item = {
  id: string;
  type: 'sell' | 'buy';
  title: string;
  description: string;
  price: number | null;
  category: string;
  customTag: string | null;
  contactType: string;
  /** 公开 GET 返回时为空字符串；reveal API 才会返回真实值 */
  contactValue: string;
  customContactLabel: string | null;
  photoUrls: string[];
  createdAt: string;
  /** 最近活跃时间（编辑 / 新询价 / 卖家回复都会刷新）；用于新鲜度可视化 */
  bumpedAt?: string;
  /** 主动查看次数：用户点开 / 展开卡片时累计，server 端按 visitor 节流 */
  viewCount?: number;
  /** 卖家可见：当前在 N 个独立访客的心愿单里（来自 CartEntry 表 visitor 去重） */
  cartCount?: number;
  inquiries: any[];
};

const DESCRIPTION_COLLAPSED_CHARS = 180;
const DESCRIPTION_COLLAPSED_LINES = 4;
const DESCRIPTION_COLLAPSED_LINKS = 2;

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_URL_PUNCT_RE = /[)\]}.;,，。！!、；]$/;

function splitTrailingUrlPunctuation(raw: string): { url: string; suffix: string } {
  let url = raw;
  let suffix = '';
  while (url && TRAILING_URL_PUNCT_RE.test(url)) {
    suffix = url[url.length - 1] + suffix;
    url = url.slice(0, -1);
  }
  return { url, suffix };
}

function descriptionParts(description: string): { text: string; links: string[]; lineCount: number } {
  const links: string[] = [];
  const seen = new Set<string>();
  let text = '';
  let lastIndex = 0;

  for (const match of description.matchAll(URL_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const { url, suffix } = splitTrailingUrlPunctuation(raw);

    text += description.slice(lastIndex, index);
    if (url) {
      const href = normalizeUrl(url);
      if (!seen.has(href)) {
        seen.add(href);
        links.push(url);
      }
      text += suffix;
    } else {
      text += raw;
    }
    lastIndex = index + raw.length;
  }

  text += description.slice(lastIndex);
  const cleaned = text
    .split(/\r?\n/)
    .map(line => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .trim();

  return {
    text: cleaned,
    links,
    lineCount: description.split(/\r?\n/).length,
  };
}

function normalizeUrl(raw: string): string {
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
}

function shortUrlLabel(raw: string): string {
  try {
    const url = new URL(normalizeUrl(raw));
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    const label = `${host}${path}`;
    return label.length > 42 ? `${label.slice(0, 39)}...` : label;
  } catch {
    return raw.length > 42 ? `${raw.slice(0, 39)}...` : raw;
  }
}

export function ItemCard({
  item,
  onEdit,
  onMarkSold,
  onReport,
  onDeleteInquiryAsSeller,
  refresh,
  autoExpand = false,
}: {
  item: Item;
  onEdit: (item: Item) => void;
  onMarkSold: (item: Item) => void;
  onReport: (item: Item) => void;
  onDeleteInquiryAsSeller: (item: Item, inquiryId: string) => void;
  refresh: () => void;
  /** 主页用 ?focus=ID 进来时，对应卡片 mount 自动展开 + 滚到视野中央 */
  autoExpand?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  // 心愿单状态：mount + subscribe 让按钮状态跨标签/同标签同步
  const [inCart, setInCart] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  useEffect(() => {
    const update = () => setInCart(isInCart(item.id));
    update();
    return subscribeCart(update);
  }, [item.id]);

  const toggleCart = async () => {
    if (cartBusy) return;
    if (inCart) {
      removeFromCart(item.id);
      return;
    }
    setCartBusy(true);
    try {
      // 加入心愿单 = 用户的明确购买意向 → 顺便 reveal 联系方式拿 contactValue（同时给卖家 reveal count +1）
      const res = await fetch(`/api/items/${item.id}/reveal-contact`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { showError(data.error || '加入失败'); return; }
      const ret = addToCart({
        id: item.id,
        title: item.title,
        price: item.price,
        itemType: item.type,
        category: item.category,
        photoUrl: item.photoUrls[0] ?? null,
        contactType: data.contactType,
        contactValue: data.contactValue,
        customContactLabel: data.customContactLabel,
      });
      if (ret === 'full') {
        showWarning('心愿单满了（≤50 件），先去清单删除一些再加');
        return;
      }
      if (ret === true) {
        // UX-13:同卖家其他物品曝光。失败静默降级为普通"已加入"toast
        try {
          const ssRes = await fetch(
            `/api/items/by-contact?value=${encodeURIComponent(data.contactValue)}&excludeId=${item.id}&limit=30`,
          );
          if (ssRes.ok) {
            const ssData = await ssRes.json();
            const others = (ssData.items ?? []) as any[];
            const mapped: SameSellerItem[] = others.map((it: any) => ({
              id: it.id,
              title: it.title,
              price: it.price,
              itemType: it.type,
              category: it.category,
              photoUrls: it.photoUrls ?? [],
              contactType: it.contactType,
              contactValue: it.contactValue,
              customContactLabel: it.customContactLabel,
            }));
            if (!showSameSellerToast(mapped)) {
              showSuccess('已加入心愿单');
            }
          } else {
            showSuccess('已加入心愿单');
          }
        } catch {
          showSuccess('已加入心愿单');
        }
      }
    } finally {
      setCartBusy(false);
    }
  };
  // 统一的展开状态 —— 三种 click 来源都 toggle 它
  const [expanded, setExpanded] = useState(autoExpand);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const photos = item.photoUrls;
  const cardRef = useRef<HTMLDivElement>(null);
  const viewTrackedRef = useRef(false);
  const [origin, setOrigin] = useState('');
  const [displayViewCount, setDisplayViewCount] = useState(item.viewCount ?? 0);
  useEffect(() => { setOrigin(clientOrigin()); }, []);
  useEffect(() => { setDescriptionExpanded(false); }, [item.id]);
  useEffect(() => {
    viewTrackedRef.current = false;
    setDisplayViewCount(item.viewCount ?? 0);
  }, [item.id, item.viewCount]);

  const desc = useMemo(() => descriptionParts(item.description ?? ''), [item.description]);
  const descriptionIsLong =
    desc.text.length > DESCRIPTION_COLLAPSED_CHARS ||
    desc.lineCount > DESCRIPTION_COLLAPSED_LINES ||
    desc.links.length > DESCRIPTION_COLLAPSED_LINKS;
  const visibleDescriptionLinks = descriptionExpanded
    ? desc.links
    : desc.links.slice(0, DESCRIPTION_COLLAPSED_LINKS);

  const reportView = useCallback(() => {
    if (viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    fetch(`/api/items/${item.id}/view`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data.viewCount === 'number') {
          setDisplayViewCount(data.viewCount);
        }
      })
      .catch(() => {
        // 统计失败不影响浏览体验
      });
  }, [item.id]);

  // autoExpand 触发:分享链接 ?focus=ID / 同卖家 toast router.push 都会改 autoExpand prop
  // Sprint 6.7h 补 setExpanded(true) + block 改 'start' 让 scroll-margin-top 生效,
  // 卡片顶部对齐筛选栏下沿(不被 sticky header 盖住)
  useEffect(() => {
    if (!autoExpand) return;
    setExpanded(true);
    markRecentView(item.id);
    reportView();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
    );
  }, [autoExpand, item.id, reportView]);

  /**
   * 两种展开来源都 toggle 同一个 expanded 状态：
   *   'card'    → 卡顶端到屏顶（点空白处）
   *   'inquiry' → 第一条留言到屏中央（点 X 条留言）
   */
  const toggleExpand = (target: 'card' | 'inquiry') => {
    setExpanded(prev => {
      const next = !prev;
      if (next) {
        // 展开 = 用户对这件商品感兴趣 → 记进"最近浏览"
        markRecentView(item.id);
        reportView();

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

  // ⋯ 菜单：卖家相关的操作（编辑 / 删除 / 举报）折进来
  // 让买家视图更干净——卡片上不再常驻 3 个按钮抢注意力
  const moreMenuItems = [
    { icon: <Pencil size={14} />, label: t('card.edit'),     onClick: () => onEdit(item) },
    { icon: <Trash2 size={14} />, label: t('card.markSold'), onClick: () => onMarkSold(item), danger: true },
    { icon: <Flag size={14} />,   label: t('card.report'),   onClick: () => onReport(item) },
  ];

  return (
    <div
      ref={cardRef}
      data-item-id={item.id}
      onClick={onCardClick}
      className={`bg-white rounded-card shadow-sm border ${expanded ? 'border-brand/40' : 'border-stone-200'} p-3 md:p-4 hover:shadow-md transition-all cursor-pointer scroll-mt-44 md:scroll-mt-24 ${expanded ? 'col-span-2 md:col-span-1' : ''}`}
    >
      {/* === 图片：手机端封面图（正方形）/ 桌面端缩略图横排 === */}
      {photos.length > 0 && (
        <>
          {/* Mobile：封面图 + 右上角购物车浮按钮（按钮在图外面，避免 button-in-button） */}
          <div className="md:hidden relative mb-2">
            <button
              onClick={() => setZoomIdx(0)}
              className="block w-full aspect-square overflow-hidden rounded"
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
            {/* 加入心愿单浮按钮 —— 紧凑模式买家明确"想要"的入口 */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleCart(); }}
              disabled={cartBusy}
              aria-label={inCart ? '从心愿单移除' : '加入心愿单'}
              className={`absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center shadow-card active:scale-90 transition-all disabled:opacity-60 ${
                inCart
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/90 text-stone-700 hover:bg-white backdrop-blur-sm'
              }`}
            >
              {inCart ? <Check size={16} strokeWidth={3} /> : <Heart size={15} strokeWidth={2.2} />}
            </button>
          </div>

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

      {/* === 标签行 ===
          - 类型 chip（出售/求购，brand 色）
          - 类目 chip（带类目色小圆点 + 浅色 tint 底）
          - 新鲜度 badge（< 24h 绿色显眼；老贴视觉降权）
          - ⋯ 菜单（卖家操作折叠）
      */}
      {(() => {
        const fresh = freshnessBadge(item.bumpedAt ?? item.createdAt, locale);
        return (
          <div className="flex items-center gap-1.5 text-[10px] md:text-xs mb-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              item.type === 'sell' ? 'bg-brand text-white' : 'bg-accent text-white'
            }`}>
              {typeLabel(item.type, item.category, locale)}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-stone-700 truncate max-w-[120px] md:max-w-none ${categoryBgClass(item.category)}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${categoryDotClass(item.category)}`} />
              {categoryLabel(item.category, locale)}
              {item.customTag && ` · ${item.customTag}`}
            </span>
            {/* UX A3:0 次查看不渲染 chip —— 冷启动期满屏「👁 0」观感=没人气 */}
            {displayViewCount > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500" title="主动查看次数">
                <Eye size={11} strokeWidth={2.2} />
                {displayViewCount}
              </span>
            )}
            {/* 新鲜度：手机默认隐藏（节省视觉空间），展开后显示；桌面常驻 */}
            <span className={`ml-auto whitespace-nowrap ${fresh.className} ${expanded ? 'inline' : 'hidden md:inline'}`}>
              {fresh.label}
            </span>
            {/* ⋯ 菜单：手机展开后才显示；桌面常驻 */}
            <span className={expanded ? 'inline' : 'hidden md:inline'}>
              <MoreMenu items={moreMenuItems} />
            </span>
          </div>
        );
      })()}

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
        <div className={`text-sm text-stone-700 mb-3 ${expanded ? 'block' : 'hidden md:block'}`}>
          {desc.text && (
            <p
              className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                descriptionIsLong
                  ? descriptionExpanded ? 'max-h-56 overflow-y-auto pr-1' : 'line-clamp-4'
                  : ''
              }`}
            >
              {desc.text}
            </p>
          )}

          {visibleDescriptionLinks.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {visibleDescriptionLinks.map(link => {
                const href = normalizeUrl(link);
                return (
                  <div
                    key={href}
                    className="flex items-center gap-1.5 min-w-0 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5"
                  >
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 min-w-0 flex-1 text-brand hover:text-brand-dark"
                    >
                      <ExternalLink size={13} className="flex-shrink-0" />
                      <span className="truncate">{shortUrlLabel(link)}</span>
                    </a>
                    <CopyButton
                      text={href}
                      label="复制"
                      copiedLabel="已复制"
                      className="flex-shrink-0"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {descriptionIsLong && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setDescriptionExpanded(v => !v);
              }}
              className="mt-1.5 text-xs font-medium text-brand hover:text-brand-dark"
            >
              {descriptionExpanded ? '收起描述' : '展开描述'}
            </button>
          )}
        </div>
      )}

      {/* === 联系方式 — UX C10 直显(Sean 拍板恢复「所有信息一屏全开」):
            展开卡即见「微信: xxx + 复制」,不再有 reveal 按钮拦一道。
            guard:某些 feed(如 admin)可能仍返回空 contactValue,空值不渲染 === */}
      <div className={`${expanded ? 'flex' : 'hidden md:flex'} items-center gap-1.5 mb-2 flex-wrap text-xs md:text-sm`}>
        {item.contactValue && (
          <>
            <span className="text-stone-600 truncate min-w-0">
              {contactTypeLabel(item.contactType, item.customContactLabel, locale)}：
              <span className="font-mono text-stone-900 select-all ml-1">{item.contactValue}</span>
            </span>
            <CopyButton text={item.contactValue} />
          </>
        )}
        {/* 加入心愿单 / 已加入：买家批量买的入口（展开模式文字按钮） */}
        <button
          onClick={toggleCart}
          disabled={cartBusy}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs whitespace-nowrap transition-colors disabled:opacity-50 ${
            inCart
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
              : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
          }`}
        >
          {inCart ? <Check size={13} strokeWidth={2.5} /> : <Heart size={13} />}
          {inCart ? '已在心愿单' : '加入心愿单'}
        </button>

        {/* 分享：内容是「标题 — $价格 + 链接」，方便丢到微信里
            label 用 t('card.share')(简化到"分享"),className 不覆盖 — 跟 ShareButton 默认纯白 pill 一致 */}
        {origin && (
          <ShareButton
            shareText={buildItemShareText({
              title: item.title,
              price: item.price,
              itemType: item.type,
              category: item.category,
              origin,
              itemId: item.id,
            })}
            label={t('card.share')}
          />
        )}
      </div>

      {/* 卖家操作（编辑/删除/举报）已折进上方标签行的 ⋯ 菜单。
          这样买家视图更干净，卖家自己访问时仍可一键到达 */}

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
            className="absolute top-3 right-4 text-white w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            onClick={(e) => { e.stopPropagation(); setZoomIdx(null); }}
            aria-label={t('lightbox.close')}
          ><X size={24} /></button>

          {photos.length > 1 && (
            <button
              onClick={goPrev}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/70 transition-colors"
              aria-label={t('lightbox.prev')}
            ><ChevronLeft size={28} /></button>
          )}

          {/* Lightbox 大图：用原生 <img> 而不是 next/image。
              原因：fill 模式需要父容器有明确尺寸，在 flex 居中容器里会铺满整屏挡住四角的按钮，
              导致用户"点图片卡住关不掉"。大图本身就是给用户看完整原图，不需要 srcset；
              Cloudinary URL 已自带 q_auto/f_auto 优化。*/}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[zoomIdx]}
            alt={`${item.title} ${zoomIdx + 1}`}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {photos.length > 1 && (
            <button
              onClick={goNext}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/70 transition-colors"
              aria-label={t('lightbox.next')}
            ><ChevronRight size={28} /></button>
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
