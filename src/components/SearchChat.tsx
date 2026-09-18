'use client';

// Sprint 10C:第 2 层「继续问」
//
// 第 1 层底部的一个输入框「没找到？描述一下你要的」。发送后**就地展开**为对话区(不弹窗、不跳页、不遮盖列表):
// 用户消息气泡 → 助手一句话 + 卡片行(ItemCard,标签「AI 推荐」)。
// 对话状态只在内存:刷新即清,不落库、不关联身份;换搜索词时父组件用 key 重置本组件。
// 达到配额:输入框禁用并显示接口返回的提示。当日预算熔断(503):整个第 2 层隐藏,第 1 层不受影响。

import { useRef, useState } from 'react';
import { SendHorizontal, Sparkles } from 'lucide-react';
import { ItemCard, type Item } from '@/components/ItemCard';
import { useT, useLocale } from '@/i18n/I18nProvider';

interface Turn {
  id: number;
  user: string;
  summary: string;
  items: Item[];
  pending: boolean;
  error?: boolean;
}

type CardProps = Omit<Parameters<typeof ItemCard>[0], 'item' | 'badge' | 'autoExpand'>;

const MAX_HISTORY_TURNS = 6;

/** 解析 SSE 文本块:返回完整事件与剩余未完成的尾巴 */
function parseSse(buffer: string): { events: { event: string; data: any }[]; rest: string } {
  const events: { event: string; data: any }[] = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const b of blocks) {
    let event = 'message';
    let data = '';
    for (const line of b.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    try { events.push({ event, data: data ? JSON.parse(data) : {} }); } catch { /* 坏块跳过 */ }
  }
  return { events, rest };
}

export function SearchChat({
  filters,
  cardProps,
}: {
  /** 当前筛选条件(与列表接口同名参数),对话检索沿用同一范围 */
  filters: Record<string, string>;
  cardProps: CardProps;
}) {
  const t = useT();
  const locale = useLocale();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [disabledMsg, setDisabledMsg] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const seq = useRef(0);

  if (hidden) return null;

  const patch = (id: number, p: Partial<Turn>) => setTurns(ts => ts.map(x => (x.id === id ? { ...x, ...p } : x)));

  const send = async () => {
    const message = input.trim();
    if (!message || busy || disabledMsg) return;
    const id = ++seq.current;
    // 历史:已完成的轮次,最多 6 轮;助手侧只回传 summary(卡片由服务端重新检索,不信任客户端给的 id)
    const history = turns.filter(x => !x.pending && !x.error).slice(-MAX_HISTORY_TURNS)
      .flatMap(x => [{ role: 'user', content: x.user }, { role: 'assistant', content: x.summary }]);
    setTurns(ts => [...ts, { id, user: message, summary: '', items: [], pending: true }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/search/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: 'items', message, history, filters }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setDisabledMsg(data?.message?.[locale] ?? data?.error ?? t('search.chatLimited'));
        setTurns(ts => ts.filter(x => x.id !== id));
        return;
      }
      if (res.status === 503 || res.status === 404) { setHidden(true); return; }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let summary = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const { events, rest } = parseSse(buf);
        buf = rest;
        for (const ev of events) {
          if (ev.event === 'summary' && typeof ev.data.text === 'string') { summary += ev.data.text; patch(id, { summary }); }
          else if (ev.event === 'items') patch(id, { items: Array.isArray(ev.data.items) ? ev.data.items : [] });
        }
      }
      patch(id, { pending: false });
    } catch {
      patch(id, { pending: false, error: true, summary: t('search.chatError') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4" data-testid="search-chat">
      {turns.length > 0 && (
        <div className="space-y-3 mb-3">
          {turns.map(turn => (
            <div key={turn.id} className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-brand text-white text-sm rounded-2xl rounded-br-sm px-3 py-2 break-words">{turn.user}</div>
              </div>
              <div className="flex justify-start">
                <div className={`max-w-[85%] text-sm rounded-2xl rounded-bl-sm px-3 py-2 break-words ${turn.error ? 'bg-rose-50 text-rose-700' : 'bg-violet-50 text-stone-800'}`}>
                  <Sparkles size={12} className="inline mr-1 text-violet-500 align-[-1px]" />
                  {turn.summary || (turn.pending ? t('search.chatThinking') : '')}
                  {turn.pending && <span className="inline-block w-1.5 h-3 ml-0.5 bg-violet-400 align-[-1px] animate-pulse" />}
                </div>
              </div>
              {turn.items.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4 items-start">
                  {turn.items.map(item => (
                    <ItemCard key={`${turn.id}-${item.id}`} item={item} badge={t('search.chatBadge')} {...cardProps} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); void send(); }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          maxLength={300}
          disabled={busy || !!disabledMsg}
          placeholder={t('search.chatPlaceholder')}
          aria-label={t('search.chatPlaceholder')}
          // 16px:iOS 小于 16px 的输入框聚焦会自动放大页面
          className="flex-1 min-w-0 bg-white border border-stone-300 rounded-chip px-3 py-2 text-base md:text-sm focus:outline-none focus:border-violet-400 disabled:bg-stone-100 disabled:text-stone-400"
          onFocus={(e) => {
            // 键盘弹起后把输入框滚进可视区,不被键盘遮挡
            const el = e.currentTarget;
            setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
          }}
        />
        <button
          type="submit"
          disabled={busy || !!disabledMsg || !input.trim()}
          aria-label={t('search.chatSend')}
          className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-violet-600 text-white disabled:bg-stone-300 transition-colors"
        >
          <SendHorizontal size={16} />
        </button>
      </form>
      <div className="text-[11px] text-stone-400 mt-1.5 px-1">
        {disabledMsg ?? t('search.chatNote')}
      </div>
    </div>
  );
}
