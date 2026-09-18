'use client';

// Sprint 10B:第 1 层「相关结果 · AI 语义匹配」
//
// 渲染规则(spec 10B):
//   - aiEnabled=false → 整块不渲染,第 0 层与现状像素级一致
//   - trigger=auto:加载中 2 张骨架卡;有结果 → 分割线 + 标题 + 灰字 + 卡片(每张带「相似」标签);0 条 → 整块不渲染
//   - trigger=button 且未点:一个次要样式按钮「找更多相似」;点了之后同 auto
//   - 被限流:一行灰字提示,不渲染卡片
// 卡片复用 ItemCard,不另做样式。

import { Sparkles } from 'lucide-react';
import { ItemCard, type Item } from '@/components/ItemCard';
import { SearchChat } from '@/components/SearchChat';
import { useT } from '@/i18n/I18nProvider';

export interface SemanticState {
  aiEnabled: boolean;
  trigger: 'auto' | 'button' | null;
  list: Item[];
  loading: boolean;
  /** 用户已点过「找更多相似」(或 trigger=auto 已算过) */
  requested: boolean;
  limited: boolean;
  /** 10C:第 2 层可用(AI 开且当日预算未熔断) */
  chatEnabled: boolean;
}

export const EMPTY_SEMANTIC: SemanticState = { aiEnabled: false, trigger: null, list: [], loading: false, requested: false, limited: false, chatEnabled: false };

export function SemanticResults({
  state,
  onRequestMore,
  cardProps,
  chatFilters,
  chatKey,
}: {
  state: SemanticState;
  onRequestMore: () => void;
  /** 10C:对话检索沿用的筛选条件,与换搜索词时重置对话用的 key */
  chatFilters: Record<string, string>;
  chatKey: string;
  /** 透传给 ItemCard 的回调(与第 0 层同一套) */
  cardProps: Omit<Parameters<typeof ItemCard>[0], 'item' | 'badge' | 'autoExpand'>;
}) {
  const t = useT();
  if (!state.aiEnabled || !state.trigger) return null;

  const showButton = state.trigger === 'button' && !state.requested && !state.loading && !state.limited;
  const showCards = state.list.length > 0;
  // 第 2 层:有第 1 层(语义卡片真的渲染出来了)才显示;trigger=button 且未点击、语义层被限流、0 条结果时都不显示(spec 10C + 零计数隐藏)
  const showChat = state.chatEnabled && state.requested && !state.loading && !state.limited && showCards;

  if (!state.loading && !showButton && !showCards && !state.limited && !showChat) return null; // 零计数隐藏

  return (
    <section className="mt-6" data-testid="semantic-results">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="flex-1 border-t border-stone-200" />
        <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 whitespace-nowrap">
          <Sparkles size={12} className="text-violet-500" />
          {t('search.aiTitle')}
        </span>
        <div className="flex-1 border-t border-stone-200" />
      </div>
      <div className="text-[11px] text-stone-400 text-center mb-3">{t('search.aiNote')}</div>

      {state.limited && (
        <div className="text-center text-xs text-stone-500 py-3">{t('search.aiLimited')}</div>
      )}

      {showButton && (
        <div className="text-center py-2">
          <button
            type="button"
            onClick={onRequestMore}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-chip border border-stone-300 bg-white text-sm text-stone-700 hover:border-violet-300 hover:text-violet-700 transition-colors"
          >
            <Sparkles size={14} />
            {t('search.aiMore')}
          </button>
        </div>
      )}

      {state.loading && (
        <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-lg border border-stone-200 p-3 md:p-4 animate-pulse">
              <div className="h-5 w-12 bg-stone-200 rounded-full mb-2" />
              <div className="h-5 bg-stone-200 rounded w-2/3 mb-2" />
              <div className="aspect-square bg-stone-100 rounded mb-2" />
              <div className="h-4 bg-stone-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {!state.loading && showCards && (
        <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4 items-start">
          {state.list.map(item => (
            <ItemCard key={item.id} item={item} badge={t('search.aiSimilar')} {...cardProps} />
          ))}
        </div>
      )}

      {showChat && <SearchChat key={chatKey} filters={chatFilters} cardProps={cardProps} />}
    </section>
  );
}
