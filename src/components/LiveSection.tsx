'use client';

// Sprint 7 Phase 3B.3:/localnews 顶部 "live" 区
//
// 显示规则:
//   - 必须 status === 'active'(过滤掉 fulfilled / canceled / expired)
//   - 有 startAt + startAt 在未来 24h 内,或
//     无 startAt + publishedAt 在过去 24h 内
//
// 排序:有 startAt 升序 → 无 startAt 按 publishedAt 倒序
//
// 最多 10 条,溢出展示 "还有 N 条" + 滚到下方主列表的 "看全部"

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { EventCard, type EventCardData } from './EventCard';

const COLLAPSED_KEY = 'hb_localnews_live_collapsed';
const MAX_DISPLAY = 10;
const ONE_DAY_MS = 24 * 3600e3;

function tsOf(t: string | Date | null | undefined): number | null {
  if (!t) return null;
  const d = typeof t === 'string' ? new Date(t) : t;
  const ms = d.getTime();
  return isNaN(ms) ? null : ms;
}

function isLiveCandidate(e: EventCardData, now: number): boolean {
  // 排除非 active 状态
  if (e.status && e.status !== 'active') return false;
  const start = tsOf(e.startAt);
  if (start !== null) {
    // startAt 在未来 24h 内
    return start >= now && start - now < ONE_DAY_MS;
  }
  // 无 startAt:依 publishedAt 过去 24h 内
  const pub = tsOf(e.publishedAt);
  if (pub === null) return false;
  return now - pub >= 0 && now - pub < ONE_DAY_MS;
}

function liveSort(a: EventCardData, b: EventCardData): number {
  const aStart = tsOf(a.startAt);
  const bStart = tsOf(b.startAt);
  // 有 startAt 的在前(升序)
  if (aStart !== null && bStart !== null) return aStart - bStart;
  if (aStart !== null) return -1;
  if (bStart !== null) return 1;
  // 都无 startAt:publishedAt 倒序
  const aPub = tsOf(a.publishedAt) ?? 0;
  const bPub = tsOf(b.publishedAt) ?? 0;
  return bPub - aPub;
}

export function LiveSection({
  events,
  onSeeAll,
  onEditEvent,
  onDeleteEvent,
  onReportEvent,
}: {
  events: EventCardData[];
  onSeeAll?: () => void;
  // Phase 3C: 把 ⋯ 菜单 callback 透传给 EventCard,live 区里的卡也支持修改/删除/举报
  onEditEvent?: (event: EventCardData) => void;
  onDeleteEvent?: (event: EventCardData) => void;
  onReportEvent?: (event: EventCardData) => void;
}) {
  // 默认折叠;用户点开过(localStorage = '0')才展开,折叠状态('1')和未点过(null)都保持折叠
  const [collapsed, setCollapsed] = useState(true);
  // hydrate 折叠状态
  useEffect(() => {
    try {
      const v = localStorage.getItem(COLLAPSED_KEY);
      if (v === '0') setCollapsed(false);
    } catch {
      /* ignore */
    }
  }, []);

  const liveList = useMemo(() => {
    const now = Date.now();
    return events.filter(e => isLiveCandidate(e, now)).sort(liveSort);
  }, [events]);

  if (liveList.length === 0) return null;

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* */ }
      return next;
    });
  };

  const displayed = liveList.slice(0, MAX_DISPLAY);
  const extra = liveList.length - displayed.length;

  return (
    <section
      aria-label="近 24 小时内的活动"
      className="mb-4 rounded-card bg-rose-50/40 border border-rose-100 border-l-4 border-l-brand overflow-hidden"
    >
      {/* 顶栏 — "live" + 红点 + 折叠 toggle */}
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-rose-50/60 transition-colors"
        aria-expanded={!collapsed}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" aria-hidden />
          <span className="font-bold text-stone-800 lowercase">live</span>
        </span>
        <span className="text-xs text-stone-500">· 近 24 小时 · {liveList.length} 条</span>
        <span className="ml-auto text-stone-400">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 pt-1">
          <div className="grid grid-cols-2 md:grid-cols-1 gap-2 md:gap-3">
            {displayed.map(e => (
              <EventCard
                key={e.id}
                event={e}
                onEdit={onEditEvent}
                onDelete={onDeleteEvent}
                onReport={onReportEvent}
              />
            ))}
          </div>
          {extra > 0 && (
            <div className="flex items-center justify-between gap-2 pt-2 text-xs">
              <span className="text-stone-500">还有 {extra} 条</span>
              {onSeeAll && (
                <button
                  type="button"
                  onClick={onSeeAll}
                  className="text-brand hover:text-brand-dark underline font-medium"
                >
                  看全部 →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
