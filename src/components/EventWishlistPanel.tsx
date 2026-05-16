'use client';

// 活动心愿单 panel(Sprint 7 Phase 1.10)
// 跟 SavedListingsPanel / ShoppingCartPanel 同款外壳:遮罩 + 居中卡片 + ESC + 底部"收起"
//
// 内容分两段:
// - 即将到来(按 startAt 升序):活动还没结束的(或没填时间的)
// - 已过期(默认折叠,可展开):endAt 已过(无 endAt 用 startAt + 6h 兜底)
//
// 「已过期」段是 archive 概念 — Sean 要求过期的"直接存档(隐藏)",所以默认是折叠态。
// 用户可以手动展开看历史,或者批量清空。

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, ChevronUp, ChevronDown, Clock, MapPin, ExternalLink } from 'lucide-react';
import {
  getSavedEvents,
  removeSavedEvent,
  subscribeSavedEvents,
  groupByTime,
  type SavedEvent,
} from '@/lib/savedEvents';
import { CalendarHeartIcon } from './CalendarHeartIcon';
import { parseLocation } from '@/lib/eventLocation';

const CATEGORY_LABEL: Record<string, string> = {
  events: '活动',
  sports: '体育',
  news: '新闻',
  discussion: '讨论',
};
const CATEGORY_CHIP: Record<string, string> = {
  events:     'bg-cat-home/10 text-cat-home',
  sports:     'bg-cat-transport/10 text-cat-transport',
  news:       'bg-cat-electronics/10 text-cat-electronics',
  discussion: 'bg-cat-books/10 text-cat-books',
};

function formatWhen(e: SavedEvent): string {
  if (!e.startAt) return '时间待定';
  const d = new Date(e.startAt);
  if (isNaN(d.getTime())) return '时间待定';
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffD = diffMs / 86400000;
  if (d.toDateString() === now.toDateString())
    return `今天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  if (diffD < 1.5 && diffD > 0)
    return `明天 ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  if (diffD < 7 && diffD > 0)
    return `${Math.ceil(diffD)} 天后 · ${d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`;
  // 远期或过去:M/D 周X
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
}

export function EventWishlistPanel({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<SavedEvent[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // ESC 关 + 锁滚动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    setList(getSavedEvents());
    return subscribeSavedEvents(() => setList(getSavedEvents()));
  }, []);

  const { upcoming, past } = useMemo(() => groupByTime(list), [list]);

  if (!mounted) return null;

  const clearAllPast = () => {
    past.forEach(e => removeSavedEvent(e.id));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-stone-50 w-full max-w-2xl rounded-card shadow-overlay my-2 sm:my-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 */}
        <div className="sticky top-0 z-10 bg-white border-b border-stone-200 px-5 py-3 flex items-center gap-3 rounded-t-card">
          <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
            <CalendarHeartIcon size={20} fill className="text-brand" />
            活动心愿单
            {list.length > 0 && (
              <span className="text-stone-500 text-sm font-normal">· {list.length} 条</span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="ml-auto text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100"
            aria-label="关闭"
          >
            <X size={22} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-3 sm:p-4 space-y-4">
          {list.length === 0 ? (
            <div className="text-center text-stone-500 py-16 bg-white rounded-lg border border-stone-200">
              <CalendarHeartIcon size={56} strokeWidth={1.2} className="mx-auto mb-4 text-stone-300" />
              <div className="mb-3">活动心愿单是空的</div>
              <button
                onClick={onClose}
                className="text-brand underline hover:text-brand-dark"
              >
                去看看黑堡本地活动 →
              </button>
            </div>
          ) : (
            <>
              {/* === 即将到来 === */}
              {upcoming.length > 0 && (
                <section>
                  <div className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2 px-1">
                    即将到来 · {upcoming.length}
                  </div>
                  <div className="space-y-2">
                    {upcoming.map(e => <EventRow key={e.id} ev={e} onClose={onClose} />)}
                  </div>
                </section>
              )}

              {/* === 已过期(默认折叠) === */}
              {past.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setShowPast(s => !s)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-card bg-stone-100 hover:bg-stone-200 text-sm text-stone-600 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      {showPast ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      已过期 · {past.length}（默认隐藏）
                    </span>
                    {showPast && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(ev) => { ev.stopPropagation(); clearAllPast(); }}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); clearAllPast(); } }}
                        className="text-xs text-stone-500 hover:text-rose-600 underline cursor-pointer"
                      >
                        全部清空
                      </span>
                    )}
                  </button>
                  {showPast && (
                    <div className="space-y-2 mt-2 opacity-70">
                      {past.map(e => <EventRow key={e.id} ev={e} onClose={onClose} dim />)}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* 底部收起按钮 */}
        <div className="border-t border-stone-200 px-4 py-3 flex justify-center bg-stone-50 rounded-b-card">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-6 py-2 bg-white border border-stone-300 text-stone-700 rounded-chip hover:bg-stone-100 active:scale-95 text-sm font-medium transition-all shadow-card"
            aria-label="收起活动心愿单"
          >
            <ChevronUp size={16} />
            收起
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EventRow({ ev, onClose, dim = false }: { ev: SavedEvent; onClose: () => void; dim?: boolean }) {
  const cat = ev.category ?? 'events';
  const chipClass = CATEGORY_CHIP[cat] ?? CATEGORY_CHIP.events;
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!(ev.imageUrl && !imgFailed);

  return (
    <div className="bg-white rounded-card border border-stone-200 px-3 py-2.5 flex items-center gap-3">
      {/* 缩略图 / 占位 */}
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ev.imageUrl!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-14 w-14 object-cover rounded flex-shrink-0 bg-stone-100"
        />
      ) : (
        <div className={`h-14 w-14 rounded flex-shrink-0 flex items-center justify-center text-stone-300 ${chipClass.split(' ')[0]}`}>
          <CalendarHeartIcon size={22} strokeWidth={1.4} className="opacity-60" />
        </div>
      )}

      {/* 主体 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs mb-0.5 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded-full font-medium ${chipClass}`}>
            {CATEGORY_LABEL[cat] ?? cat}
          </span>
          <span className="text-stone-500 inline-flex items-center gap-0.5">
            <Clock size={11} />
            {formatWhen(ev)}
          </span>
        </div>
        <a
          href={ev.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="block text-sm font-medium text-stone-900 truncate hover:text-brand no-underline"
        >
          {ev.title}
          <ExternalLink size={11} className="inline ml-1 -mt-0.5 text-stone-300" />
        </a>
        {(() => {
          const { city, venue } = parseLocation(ev.location);
          if (!city && !venue) return null;
          return (
            <div className="text-xs text-stone-500 flex items-center gap-0.5 truncate">
              <MapPin size={11} className="flex-shrink-0" />
              <span className="truncate">
                {city && <span className="font-medium text-stone-700">{city}</span>}
                {city && venue && <span className="text-stone-400"> · </span>}
                {venue && <span>{venue}</span>}
              </span>
            </div>
          );
        })()}
      </div>

      {/* 移除 */}
      <button
        onClick={() => removeSavedEvent(ev.id)}
        className="p-1.5 text-stone-400 hover:text-rose-600 flex-shrink-0"
        title="移除"
        aria-label="移除"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
