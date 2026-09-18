'use client';

// Sprint 10B / 10B-2:第 1 层「相关结果 · AI 语义匹配」,三个站点共用
//
// 渲染规则(spec 10B):
//   - aiEnabled=false → 整块不渲染,第 0 层与现状像素级一致
//   - trigger=auto:加载中 2 张骨架卡;有结果 → 分割线 + 标题 + 灰字 + 卡片(每张带「相似」标签);0 条 → 整块不渲染
//   - trigger=button 且未点:一个次要样式按钮「找更多相似」;点了之后同 auto
//   - 被限流:一行灰字提示,不渲染卡片
// 卡片由调用方用 renderCard 渲染(ItemCard / ListingCard / EventCard),这里不绑定卡片类型。
// 第 2 层对话(10C)只在传了 chat 时出现(v1 只有二手站)。

import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import type { ItemCard } from '@/components/ItemCard';
import { SearchChat } from '@/components/SearchChat';
import { useT } from '@/i18n/I18nProvider';

export interface SemanticState<T extends { id: string } = any> {
  aiEnabled: boolean;
  trigger: 'auto' | 'button' | null;
  list: T[];
  loading: boolean;
  /** 用户已点过「找更多相似」(或 trigger=auto 已算过) */
  requested: boolean;
  limited: boolean;
  /** 10C:第 2 层可用(AI 开且当日预算未熔断) */
  chatEnabled: boolean;
}

export const EMPTY_SEMANTIC: SemanticState = { aiEnabled: false, trigger: null, list: [], loading: false, requested: false, limited: false, chatEnabled: false };

type ItemCardProps = Omit<Parameters<typeof ItemCard>[0], 'item' | 'badge' | 'autoExpand'>;

export function SemanticResults<T extends { id: string }>({
  state,
  onRequestMore,
  renderCard,
  chat,
}: {
  state: SemanticState<T>;
  onRequestMore: () => void;
  /** 渲染一张卡片;badge 是「相似」文案,交给卡片组件显示在标签行 */
  renderCard: (item: T, badge: string) => ReactNode;
  /** 10C:对话检索沿用的筛选条件、换搜索词时重置对话用的 key、对话里卡片的回调 */
  chat?: { filters: Record<string, string>; chatKey: string; cardProps: ItemCardProps };
}) {
  const t = useT();
  if (!state.aiEnabled || !state.trigger) return null;

  const showButton = state.trigger === 'button' && !state.requested && !state.loading && !state.limited;
  const showCards = state.list.length > 0;
  // 第 2 层:有第 1 层(语义卡片真的渲染出来了)才显示;trigger=button 且未点击、语义层被限流、0 条结果时都不显示(spec 10C + 零计数隐藏)
  const showChat = !!chat && state.chatEnabled && state.requested && !state.loading && !state.limited && showCards;

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
          {state.list.map(item => renderCard(item, t('search.aiSimilar')))}
        </div>
      )}

      {showChat && chat && <SearchChat key={chat.chatKey} filters={chat.filters} cardProps={chat.cardProps} />}
    </section>
  );
}
