'use client';

// 室友 listing 卡片 —— 双态版（紧凑 / 展开）+ 完整功能按钮
// - 手机端默认双列紧凑（封面 + 类型 + 标题 + 预算 + 区域）
// - 点击 → expanded：col-span-2 占满整行，显示完整内容 + 申请联系
// - 桌面端始终单列（grid-cols-2 md:grid-cols-1 + col-span-2 md:col-span-1）
// - 图片 lightbox（封面/缩略图均可点开）
// - ⋯ 菜单：编辑 / 删除 / 举报
// - 分享按钮（生成微信文本）
// - 租赁场景（C/D）隐藏发布人性别年龄，房东限制租客性别时顶部突出

import { useState, useRef, useEffect } from 'react';
import NextImage from 'next/image';
import {
  Mail, MapPin, X,
  ChevronLeft, ChevronRight,
  Pencil, Trash2, Flag,
} from 'lucide-react';
import {
  LISTING_TYPES,
  LIFESTYLE_DIMS,
  freshnessBadge,
} from '@/lib/utils';
import { markRecentView } from '@/lib/recentViews';
import { MoreMenu } from './MoreMenu';
import { ShareButton } from './ShareButton';
import { buildListingShareText, clientOrigin } from '@/lib/shareText';

export type Listing = {
  id: string;
  type: string;
  posterGender: string;
  ageRange: string | null;
  lookingForGender: string;
  title: string;
  description: string;
  photoUrls: string[];
  hasPlace: boolean;
  housingLayout: string | null;
  moveInStart: string | null;
  moveInEnd: string | null;
  moveInFuzzy?: string | null;       // 立即/1月内/春/暑/秋/灵活
  currentResidents?: number | null;  // A 类型：现住几人（含你将加入的）
  furnished?: boolean | null;        // C/D 类型：是否带家具
  budgetMin: number | null;
  budgetMax: number | null;
  areas: string[];
  sleepSchedule: string | null;
  cleanliness: string | null;
  social: string | null;
  smoking: string | null;
  drinking: string | null;
  pets: string | null;
  guests: string | null;
  contactType: string;
  createdAt: string;
  bumpedAt?: string;
};

const MOVEIN_FUZZY_LABEL: Record<string, string> = {
  immediate:    '立即可入住',
  within_month: '1 个月内可入住',
  spring_term:  '春季学期入住',
  summer:       '暑期入住',
  fall_term:    '秋季学期入住',
  flexible:     '入住时间灵活',
};

const TYPE_COLOR: Record<string, { chip: string; dot: string }> = {
  find_roommate: { chip: 'bg-blue-50   text-blue-700   border-blue-200',   dot: 'bg-blue-500'   },
  co_rent:       { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  sublet:        { chip: 'bg-amber-50  text-amber-700  border-amber-200',  dot: 'bg-amber-500'  },
  summer:        { chip: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
};

const GENDER_LABEL: Record<string, string> = {
  F: '女', M: '男', nb: '非二元', unspecified: '未透露',
};

const LIFESTYLE_LABEL: Record<string, Record<string, string>> = {
  sleepSchedule: { early: '早睡', late: '晚睡', flexible: '作息灵活' },
  cleanliness:   { neat: '整洁', average: '一般', casual: '随性' },
  social:        { quiet: '安静', occasional: '偶尔聚会', frequent: '常聚会' },
  smoking:       { no: '不吸烟', ok: '接受烟', yes: '吸烟' },
  drinking:      { no: '不喝酒', occasional: '偶尔喝', frequent: '常喝' },
  pets:          { none: '无宠物', cat: '有猫', dog: '有狗', other: '其他宠物' },
  guests:        { no: '不接受过夜', occasional: '偶尔过夜 OK', ok: '过夜 OK' },
};

/**
 * 转租 / 暑期日期格式化 —— 必须带年份避免歧义（"7/11 – 6/11" 看不出是跨年还是反了）
 * 同一年时简写：`2026/7/11 – 6/11`
 * 跨年时完整：`2026/7/11 – 2027/6/11`
 */
function formatDateRange(s: string | null, e: string | null): string {
  if (!s && !e) return '';
  const fmtFull = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };
  const fmtMD = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  if (s && e) {
    const ds = new Date(s);
    const de = new Date(e);
    if (ds.getFullYear() === de.getFullYear()) {
      return `${fmtFull(s)} – ${fmtMD(e)}`;
    }
    return `${fmtFull(s)} – ${fmtFull(e)}`;
  }
  if (s) return `${fmtFull(s)} 起`;
  return `至 ${fmtFull(e!)}`;
}

function formatBudget(min: number | null, max: number | null): string {
  if (min === null && max === null) return '面议';
  if (min !== null && max !== null && min === max) return `$${min}/月`;
  if (min !== null && max !== null) return `$${min}–${max}/月`;
  if (min !== null) return `$${min}+/月`;
  return `≤$${max}/月`;
}

export function ListingCard({
  listing,
  onApply,
  onEdit,
  onDelete,
  onReport,
  autoExpand = false,
}: {
  listing: Listing;
  onApply: (l: Listing) => void;
  onEdit?: (l: Listing) => void;
  onDelete?: (l: Listing) => void;
  onReport?: (l: Listing) => void;
  /** 分享链接 /roommates?focus=ID 打开时，对应卡片自动展开 + scroll */
  autoExpand?: boolean;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const [expanded, setExpanded] = useState(autoExpand);
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const [origin, setOrigin] = useState('');
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => { setOrigin(clientOrigin()); }, []);

  // autoExpand 触发：focus 进来的目标卡片自动展开 + scroll
  useEffect(() => {
    if (!autoExpand) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
    );
  }, [autoExpand]);

  const typeMeta = LISTING_TYPES.find(t => t.id === listing.type);
  const typeColor = TYPE_COLOR[listing.type] ?? TYPE_COLOR.find_roommate;
  const fresh = freshnessBadge(listing.bumpedAt ?? listing.createdAt, 'zh');
  const isRental = listing.type === 'sublet' || listing.type === 'summer';

  // 收集 active 生活方式 chips
  const lifestyleChips: string[] = [];
  for (const k of Object.keys(LIFESTYLE_DIMS)) {
    const v = (listing as any)[k];
    if (v && LIFESTYLE_LABEL[k]?.[v]) lifestyleChips.push(LIFESTYLE_LABEL[k][v]);
  }

  const photos = Array.isArray(listing.photoUrls) ? listing.photoUrls : [];

  const toggleExpand = () => {
    setExpanded(prev => {
      const next = !prev;
      if (next) {
        markRecentView(listing.id, 'listing');
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          })
        );
      }
      return next;
    });
  };

  // 点卡片空白处 → toggle expand；点按钮/缩略图/图片不触发
  const onCardClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, label, [data-no-toggle]')) return;
    toggleExpand();
  };

  const handleApply = () => {
    markRecentView(listing.id, 'listing');
    onApply(listing);
  };

  // === Lightbox: 键盘 + 滚动锁 ===
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

  const moreMenuItems = [
    ...(onEdit   ? [{ icon: <Pencil size={14} />, label: '编辑',  onClick: () => onEdit(listing) }] : []),
    ...(onDelete ? [{ icon: <Trash2 size={14} />, label: '删除',  onClick: () => onDelete(listing), danger: true }] : []),
    ...(onReport ? [{ icon: <Flag   size={14} />, label: '举报',  onClick: () => onReport(listing) }] : []),
  ];

  const shareText = origin
    ? buildListingShareText({
        title: listing.title,
        listingType: listing.type,
        typeLabel: typeMeta?.label ?? listing.type,
        budgetMin: listing.budgetMin,
        budgetMax: listing.budgetMax,
        areas: listing.areas,
        origin,
        listingId: listing.id,
      })
    : '';

  return (
    <>
      <article
        ref={cardRef}
        data-listing-id={listing.id}
        onClick={onCardClick}
        className={`bg-white rounded-card shadow-card border overflow-hidden hover:shadow-card-hover transition-all cursor-pointer scroll-mt-24 ${
          expanded ? 'border-brand/40 col-span-2 md:col-span-1' : 'border-stone-200'
        }`}
      >
        {/* === 图片区 === */}
        {photos.length > 0 && (
          <>
            {/* Mobile：紧凑模式封面图（点击进 lightbox） */}
            <button
              data-no-toggle
              onClick={() => setZoomIdx(0)}
              className="md:hidden block w-full aspect-[4/3] relative overflow-hidden bg-stone-100"
              aria-label={`查看第 1 / ${photos.length} 张图`}
            >
              <NextImage
                src={photos[0]}
                alt={listing.title}
                fill
                sizes="50vw"
                className="object-cover"
              />
              {photos.length > 1 && (
                <span className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                  {photos.length} 张
                </span>
              )}
            </button>

            {/* Desktop：缩略图横排，每张可点开 lightbox */}
            <div className="hidden md:flex gap-2 overflow-x-auto no-scrollbar p-3 pb-1">
              {photos.map((url, i) => (
                <button
                  key={i}
                  data-no-toggle
                  onClick={() => setZoomIdx(i)}
                  className="flex-shrink-0 relative group"
                  aria-label={`查看第 ${i + 1} / ${photos.length} 张图`}
                >
                  <NextImage
                    src={url}
                    alt={`${listing.title} ${i + 1}`}
                    width={120}
                    height={90}
                    sizes="120px"
                    className="h-24 w-32 object-cover rounded border border-stone-200 group-hover:border-brand transition-colors"
                  />
                  {i === 0 && photos.length > 1 && (
                    <span className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                      共 {photos.length} 张
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="p-3 md:p-4">
          {/* 头部：类型 chip + 性别/限制 chip + 新鲜度 + ⋯ 菜单 */}
          <div className="flex items-center gap-1.5 text-xs mb-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${typeColor.chip}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${typeColor.dot}`} />
              {typeMeta?.label ?? listing.type}
            </span>

            {/* A/B（合租）：显示发布人性别年龄；C/D（租赁）：隐藏 */}
            {!isRental && (
              <span className={`px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 ${expanded ? 'inline' : 'hidden md:inline'}`}>
                {GENDER_LABEL[listing.posterGender] ?? listing.posterGender}
                {listing.ageRange && ` · ${listing.ageRange}`}
              </span>
            )}

            {/* C/D：仅当房东限制租客性别时显示 */}
            {isRental && listing.lookingForGender !== 'any' && (
              <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/30 font-medium">
                {listing.lookingForGender === 'F-only' ? '仅女生租客' : '仅男生租客'}
              </span>
            )}

            <span className={`ml-auto whitespace-nowrap ${fresh.className} ${expanded ? 'inline' : 'hidden md:inline'}`}>
              {fresh.label}
            </span>

            {/* ⋯ 菜单：手机展开后才显示，桌面常驻 */}
            {moreMenuItems.length > 0 && (
              <span className={expanded ? 'inline' : 'hidden md:inline'} data-no-toggle>
                <MoreMenu items={moreMenuItems} />
              </span>
            )}
          </div>

          {/* 关键信息条：标题之上，醒目显示日期/户型/室友数/家具
              对租客来说这几个字段比"标题"和"描述"更关键，所以提到这里 */}
          <KeyInfoStrip listing={listing} />

          {/* 标题 */}
          <h3 className={`text-base md:text-lg font-semibold text-stone-900 leading-tight mb-1 ${expanded ? '' : 'line-clamp-2'}`}>
            {listing.title}
          </h3>

          {/* 预算 */}
          <div className="text-base md:text-xl font-bold text-brand mb-2">
            {formatBudget(listing.budgetMin, listing.budgetMax)}
          </div>

          {/* 描述：紧凑手机端隐藏 */}
          {listing.description && (
            <p className={`text-sm text-stone-700 mb-2 whitespace-pre-wrap ${expanded ? '' : 'hidden md:block md:line-clamp-3'}`}>
              {listing.description}
            </p>
          )}

          {/* 元信息行：只剩区域（日期/户型已上移到 KeyInfoStrip）*/}
          {listing.areas.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-stone-500 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1 truncate max-w-full">
                <MapPin size={12} className="flex-shrink-0" />
                <span className="truncate">
                  {expanded ? listing.areas.join(' · ') : listing.areas.slice(0, 2).join(' · ')}
                  {!expanded && listing.areas.length > 2 && ` +${listing.areas.length - 2}`}
                </span>
              </span>
            </div>
          )}

          {/* 生活方式 chips：紧凑手机端隐藏 */}
          {lifestyleChips.length > 0 && (
            <div className={`flex-wrap gap-1 mb-3 ${expanded ? 'flex' : 'hidden md:flex'}`}>
              {lifestyleChips.map((c, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[11px]"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* 找谁 + 分享 + 申请联系：紧凑手机端隐藏；展开 / 桌面显示 */}
          <div
            className={`items-center justify-between gap-2 pt-2 border-t border-stone-100 flex-wrap ${expanded ? 'flex' : 'hidden md:flex'}`}
            data-no-toggle
          >
            {!isRental ? (
              <div className="text-xs text-stone-500">
                {listing.lookingForGender === 'F-only' ? '仅找女生'
                  : listing.lookingForGender === 'M-only' ? '仅找男生'
                  : '不限性别'}
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2 ml-auto">
              {origin && shareText && (
                <ShareButton
                  shareText={shareText}
                  label="分享"
                  className="!text-xs"
                />
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleApply(); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-chip text-sm font-medium hover:bg-brand-dark active:scale-95 transition-all shadow-card"
              >
                <Mail size={14} />
                申请联系
              </button>
            </div>
          </div>

          {/* 紧凑手机端"点开看详情"提示 */}
          {!expanded && (
            <div className="md:hidden text-[11px] text-stone-400 mt-1">点开看详情 →</div>
          )}
        </div>
      </article>

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
            aria-label="关闭"
          ><X size={24} /></button>

          {photos.length > 1 && (
            <button
              onClick={goPrev}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/70 transition-colors"
              aria-label="上一张"
            ><ChevronLeft size={28} /></button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[zoomIdx]}
            alt={`${listing.title} ${zoomIdx + 1}`}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {photos.length > 1 && (
            <button
              onClick={goNext}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white w-12 h-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/70 transition-colors"
              aria-label="下一张"
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
                  <NextImage
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
    </>
  );
}

/**
 * 关键信息条：放在标题之上，醒目展示对租客/找室友最重要的信息
 * - 日期（带年份，避免"7/11 – 6/11"看着像反了的歧义）
 * - 户型（1B1B 等）
 * - 现住人数（A 类型，"你将加入 N 人"）
 * - 是否带家具（C/D）
 * - 模糊入住时间（A/B 的 chip 文本，moveInStart/End 不填时显示）
 */
function KeyInfoStrip({ listing }: { listing: Listing }) {
  const isRental = listing.type === 'sublet' || listing.type === 'summer';
  const hasDate = !!(listing.moveInStart || listing.moveInEnd);
  const dateText = hasDate ? formatDateRange(listing.moveInStart, listing.moveInEnd) : null;
  const fuzzyText = !hasDate && listing.moveInFuzzy
    ? (MOVEIN_FUZZY_LABEL[listing.moveInFuzzy] ?? listing.moveInFuzzy)
    : null;

  const items: Array<{ icon: string; text: string; emph?: boolean }> = [];
  if (dateText) items.push({ icon: '📅', text: dateText, emph: true });
  if (fuzzyText) items.push({ icon: '📅', text: fuzzyText });
  if (listing.housingLayout) items.push({ icon: '🏠', text: listing.housingLayout, emph: true });
  if (typeof listing.currentResidents === 'number' && listing.currentResidents >= 0) {
    items.push({ icon: '👥', text: `加入 ${listing.currentResidents} 人` });
  }
  if (isRental && typeof listing.furnished === 'boolean') {
    items.push({ icon: '🪑', text: listing.furnished ? '带家具' : '无家具' });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-sm text-stone-800 mb-2">
      {items.map((it, i) => (
        <span key={i} className={`inline-flex items-center gap-1 ${it.emph ? 'font-semibold' : ''}`}>
          <span aria-hidden>{it.icon}</span>
          {it.text}
        </span>
      ))}
    </div>
  );
}
