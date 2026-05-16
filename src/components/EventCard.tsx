'use client';

// Sprint 7 Phase 1.7:本地事件卡片(/localnews 用)
// 设计:封面图(可空,无图用类型色占位)+ 中文标题 + 时间 + 地点 + 摘要 + 来源链接

import NextImage from 'next/image';
import { Calendar, MapPin, ExternalLink } from 'lucide-react';

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

function formatEventTime(startAt: string | Date | null, endAt: string | Date | null): string | null {
  if (!startAt) return null;
  const start = typeof startAt === 'string' ? new Date(startAt) : startAt;
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
  const diffH = diffMs / 3600000;
  const diffD = diffMs / 86400000;

  // 相对时间:今天 / 明天 / N 天后
  let when: string;
  if (diffH < 6 && diffH > -3) {
    when = '即将开始';
  } else if (start.toDateString() === now.toDateString()) {
    when = `今天 ${start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  } else if (diffD < 1.5 && diffD > 0) {
    when = `明天 ${start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  } else if (diffD < 7 && diffD > 0) {
    const days = Math.ceil(diffD);
    when = `${days} 天后 · ${start.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`;
  } else {
    when = start.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
  }
  return when;
}

export function EventCard({ event }: { event: EventCardData }) {
  const cat = event.category ?? 'events';
  const colors = CATEGORY_COLOR[cat] ?? CATEGORY_COLOR.events;
  const timeLabel = formatEventTime(event.startAt, event.endAt);

  return (
    <a
      href={event.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white rounded-card border border-stone-200 shadow-card hover:shadow-card-hover overflow-hidden transition-all active:scale-[0.99] no-underline text-stone-900"
    >
      {/* 图片区(有图 → 真图;无图 → 类型色 + 占位 svg 房子或日历) */}
      <div className={`aspect-[16/9] relative overflow-hidden ${event.imageUrl ? '' : colors.placeholder + ' flex items-center justify-center'}`}>
        {event.imageUrl ? (
          <NextImage
            src={event.imageUrl}
            alt={event.title}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        ) : (
          <Calendar size={56} strokeWidth={1.2} className="opacity-50" />
        )}
      </div>

      {/* 内容 */}
      <div className="p-3 md:p-4 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <span className={`px-2 py-0.5 rounded-full font-medium ${colors.bg} ${colors.text}`}>
            {CATEGORY_LABEL[cat] ?? cat}
          </span>
          {timeLabel && (
            <span className="text-stone-600">{timeLabel}</span>
          )}
        </div>

        <h3 className="font-semibold text-stone-900 leading-tight line-clamp-2">
          {event.title}
        </h3>

        {event.location && (
          <div className="flex items-center gap-1 text-xs text-stone-500">
            <MapPin size={12} strokeWidth={2} className="flex-shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}

        {event.description && (
          <p className="text-sm text-stone-600 line-clamp-3 leading-relaxed">
            {event.description}
          </p>
        )}

        <div className="flex items-center gap-1 text-xs text-stone-400 pt-1">
          <span>来源: {event.source}</span>
          <ExternalLink size={11} strokeWidth={2} />
        </div>
      </div>
    </a>
  );
}
