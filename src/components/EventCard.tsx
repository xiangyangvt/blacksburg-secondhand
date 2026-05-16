'use client';

// Sprint 7 Phase 1.7+:本地事件卡片(/localnews 用)— 双态版
// - 紧凑(mobile 默认): 封面 + 类型 chip + 标题 + 时间(占 1 col)
// - 展开:col-span-2 md:col-span-1 占满整行,显示完整描述 + 原标题 + "查看原站" 按钮
// - 跟 ListingCard / ItemCard 同款交互:点卡片空白处 toggle,按钮/链接不触发
//
// 图片渲染:用普通 <img>(不用 NextImage)— 11 个抓取源就 11+ 个域名,挨个白名单不现实;
// 这些都是 thumbnail 不需要 next 优化;onError 失败时 fallback 到类型色占位

import { useState, useRef, useEffect } from 'react';
import { Calendar, MapPin, ExternalLink, Clock, Heart } from 'lucide-react';
import { isEventSaved, toggleSavedEvent, subscribeSavedEvents } from '@/lib/savedEvents';
import { showSuccess, showWarning } from '@/lib/toast';
import { parseLocation } from '@/lib/eventLocation';

export type EventCardData = {
  id: string;
  source: string;
  sourceUrl: string;
  title: string;
  titleOriginal: string | null;
  description: string | null;
  startAt: string | Date | null;
  endAt: string | Date | null;
  location: string | null;
  category: string | null;
  imageUrl: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  events: '活动',
  sports: '体育',
  news: '新闻',
  discussion: '讨论',
};

const CATEGORY_COLOR: Record<string, { bg: string; text: string; placeholder: string }> = {
  events:     { bg: 'bg-cat-home/10',        text: 'text-cat-home',        placeholder: 'bg-cat-home/10 text-cat-home/40' },
  sports:     { bg: 'bg-cat-transport/10',   text: 'text-cat-transport',   placeholder: 'bg-cat-transport/10 text-cat-transport/40' },
  news:       { bg: 'bg-cat-electronics/10', text: 'text-cat-electronics', placeholder: 'bg-cat-electronics/10 text-cat-electronics/40' },
  discussion: { bg: 'bg-cat-books/10',       text: 'text-cat-books',       placeholder: 'bg-cat-books/10 text-cat-books/40' },
};

/** 紧凑端显示的相对时间("今天 19:00" / "明天" / "3 天后 5/20") */
function formatEventTime(startAt: string | Date | null): string | null {
  if (!startAt) return null;
  const start = typeof startAt === 'string' ? new Date(startAt) : startAt;
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
  const diffH = diffMs / 3600000;
  const diffD = diffMs / 86400000;

  if (diffH < 6 && diffH > -3) return '即将开始';
  if (start.toDateString() === now.toDateString())
    return `今天 ${start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  if (diffD < 1.5 && diffD > 0)
    return `明天 ${start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  if (diffD < 7 && diffD > 0) {
    const days = Math.ceil(diffD);
    return `${days} 天后 · ${start.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`;
  }
  return start.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
}

/** 展开端显示的完整时间("5月20日 周三 19:00 – 22:00") */
function formatEventFullTime(startAt: string | Date | null, endAt: string | Date | null): string | null {
  if (!startAt) return null;
  const start = typeof startAt === 'string' ? new Date(startAt) : startAt;
  if (isNaN(start.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', weekday: 'short' };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  const dateStr = start.toLocaleDateString('zh-CN', opts);
  const startTime = start.toLocaleTimeString('zh-CN', timeOpts);

  if (endAt) {
    const end = typeof endAt === 'string' ? new Date(endAt) : endAt;
    if (!isNaN(end.getTime())) {
      // 同一天 → 简写;跨天 → 全写
      if (start.toDateString() === end.toDateString()) {
        return `${dateStr} ${startTime} – ${end.toLocaleTimeString('zh-CN', timeOpts)}`;
      }
      return `${dateStr} ${startTime} – ${end.toLocaleDateString('zh-CN', opts)} ${end.toLocaleTimeString('zh-CN', timeOpts)}`;
    }
  }
  return `${dateStr} ${startTime}`;
}

export function EventCard({
  event,
  autoExpand = false,
}: {
  event: EventCardData;
  /** 后续可能从 /localnews?focus=ID 进来时自动展开 */
  autoExpand?: boolean;
}) {
  const [expanded, setExpanded] = useState(autoExpand);
  const [imgFailed, setImgFailed] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  // autoExpand:focus 进来的目标卡片自动 scroll
  useEffect(() => {
    if (!autoExpand) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
    );
  }, [autoExpand]);

  const cat = event.category ?? 'events';
  const colors = CATEGORY_COLOR[cat] ?? CATEGORY_COLOR.events;
  const timeLabel = formatEventTime(event.startAt);
  const fullTimeLabel = formatEventFullTime(event.startAt, event.endAt);
  const showImage = !!(event.imageUrl && !imgFailed);
  // 城市先于场地展示(距离决策锚点)。city 加粗高亮,venue 浅色辅助
  const { city: locCity, venue: locVenue } = parseLocation(event.location);

  // 心愿单收藏状态(跟 ListingCard 同款 subscribe 模式)
  const [isSaved, setIsSaved] = useState(false);
  useEffect(() => {
    const update = () => setIsSaved(isEventSaved(event.id));
    update();
    return subscribeSavedEvents(update);
  }, [event.id]);

  const handleToggleSave = () => {
    const ret = toggleSavedEvent({
      id: event.id,
      title: event.title,
      source: event.source,
      sourceUrl: event.sourceUrl,
      startAt: typeof event.startAt === 'string'
        ? event.startAt
        : event.startAt ? event.startAt.toISOString() : null,
      endAt: typeof event.endAt === 'string'
        ? event.endAt
        : event.endAt ? event.endAt.toISOString() : null,
      location: event.location,
      category: event.category,
      imageUrl: event.imageUrl,
    });
    if (ret === 'full') showWarning('活动心愿单满了(最多 50 条)');
    else if (ret === 'added') showSuccess('已加入活动心愿单');
    // removed 静默
  };

  const toggleExpand = () => {
    setExpanded(prev => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          })
        );
      }
      return next;
    });
  };

  // 点卡片空白处 toggle;按钮 / 链接 / 标 data-no-toggle 的元素不触发
  const onCardClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, [data-no-toggle]')) return;
    toggleExpand();
  };

  return (
    <article
      ref={cardRef}
      onClick={onCardClick}
      className={`relative bg-white rounded-card shadow-card border overflow-hidden hover:shadow-card-hover transition-all cursor-pointer scroll-mt-44 md:scroll-mt-24 ${
        expanded ? 'border-brand/40 col-span-2 md:col-span-1' : 'border-stone-200'
      }`}
    >
      {/* ♥ 收藏按钮(article 级浮动):无图卡显示;有图卡用封面内的浮动 ♥ */}
      <button
        type="button"
        data-no-toggle
        onClick={(e) => { e.stopPropagation(); handleToggleSave(); }}
        aria-label={isSaved ? '从活动心愿单移除' : '加入活动心愿单'}
        className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full items-center justify-center shadow-card active:scale-90 transition-all ${
          isSaved
            ? 'bg-rose-500 text-white'
            : 'bg-white/90 text-stone-700 hover:bg-white backdrop-blur-sm'
        } ${showImage ? 'hidden' : 'flex'}`}
      >
        <Heart size={15} strokeWidth={2.2} fill={isSaved ? 'currentColor' : 'none'} />
      </button>

      {/* 图片区:紧凑端 4/3(mobile 比 16/9 更适合双列窄卡);展开 16/9 横展 */}
      <div
        className={`relative overflow-hidden ${
          expanded ? 'aspect-[2/1]' : 'aspect-[4/3] md:aspect-[16/9]'
        } ${showImage ? 'bg-stone-100' : `${colors.placeholder} flex items-center justify-center`}`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl!}
            alt={event.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <Calendar size={expanded ? 64 : 48} strokeWidth={1.2} className="opacity-50" />
        )}

        {/* 有图卡:♥ 按钮浮在封面右上,跟 ItemCard / ListingCard 一致 */}
        {showImage && (
          <button
            type="button"
            data-no-toggle
            onClick={(e) => { e.stopPropagation(); handleToggleSave(); }}
            aria-label={isSaved ? '从活动心愿单移除' : '加入活动心愿单'}
            className={`absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center shadow-card active:scale-90 transition-all ${
              isSaved
                ? 'bg-rose-500 text-white'
                : 'bg-white/90 text-stone-700 hover:bg-white backdrop-blur-sm'
            }`}
          >
            <Heart size={15} strokeWidth={2.2} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      <div className="p-3 md:p-4 space-y-1.5">
        {/* 类型 chip + 相对时间 */}
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <span className={`px-2 py-0.5 rounded-full font-medium ${colors.bg} ${colors.text}`}>
            {CATEGORY_LABEL[cat] ?? cat}
          </span>
          {timeLabel && !expanded && (
            <span className="text-stone-600">{timeLabel}</span>
          )}
        </div>

        {/* 标题 */}
        <h3 className={`font-semibold text-stone-900 leading-tight ${expanded ? 'text-base md:text-lg' : 'line-clamp-2 text-sm md:text-base'}`}>
          {event.title}
        </h3>

        {/* 紧凑端:地点(城市优先,加粗) + 描述(描述桌面才显) */}
        {!expanded && (
          <>
            {(locCity || locVenue) && (
              <div className="flex items-center gap-1 text-xs text-stone-500">
                <MapPin size={12} strokeWidth={2} className="flex-shrink-0" />
                <span className="truncate">
                  {locCity && <span className="font-medium text-stone-800">{locCity}</span>}
                  {locCity && locVenue && <span className="text-stone-400"> · </span>}
                  {locVenue && <span>{locVenue}</span>}
                </span>
              </div>
            )}
            {event.description && (
              <p className="text-sm text-stone-600 leading-relaxed hidden md:block md:line-clamp-3">
                {event.description}
              </p>
            )}
            <div className="md:hidden text-[11px] text-stone-400 pt-1">点开看详情 →</div>
          </>
        )}

        {/* 展开:完整时间 + 地点 + 描述 + 原标题 + 跳源按钮 */}
        {expanded && (
          <div className="space-y-2 pt-1">
            {fullTimeLabel && (
              <div className="flex items-start gap-1.5 text-sm text-stone-700">
                <Clock size={14} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
                <span>{fullTimeLabel}</span>
              </div>
            )}
            {(locCity || locVenue) && (
              <div className="flex items-start gap-1.5 text-sm text-stone-700">
                <MapPin size={14} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
                <span>
                  {locCity && <span className="font-semibold">{locCity}</span>}
                  {locCity && locVenue && <span className="text-stone-400"> · </span>}
                  {locVenue && <span className="text-stone-700">{locVenue}</span>}
                </span>
              </div>
            )}
            {event.description && (
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
                {event.description}
              </p>
            )}
            {event.titleOriginal && event.titleOriginal !== event.title && (
              <div className="text-xs text-stone-500 pt-1 border-t border-stone-100">
                原标题: <span className="italic">{event.titleOriginal}</span>
              </div>
            )}

            {/* 操作区:跳源 + 来源标 */}
            <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-stone-100" data-no-toggle>
              <span className="text-[11px] text-stone-400">来源: {event.source}</span>
              <a
                href={event.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-chip text-sm font-medium hover:bg-brand-dark active:scale-95 transition-all shadow-card no-underline"
              >
                <ExternalLink size={13} />
                查看原站
              </a>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
