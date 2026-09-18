'use client';

// Sprint 10C:第 2 层对话 · Sprint 11E 起并入顶部搜索栏(统一问询栏)
//
// **本组件没有自己的输入框**(11E,Sean:搜索、AI、问站长是一个 UI)。用户在顶部搜索栏回车 / 点发送,
// 父组件把那句话经 `ask` 传进来(id 变 = 新的一句);顶栏是 sticky 的,继续问也在同一个栏里。
// 对话区在列表上方**就地展开**(不弹窗、不跳页):用户消息气泡 → 助手一句话 + 卡片行(ItemCard,标签「AI 推荐」)。
// intent=ask_ops(用户在问站务 / 反馈问题)→ 不出卡片,出「转给站长」卡片,预填用户原话,用户点发送才提交。
// 对话状态只在内存:刷新即清,不落库、不关联身份;父组件用 onClose 关闭。
// 达到配额:显示接口返回的提示 + 「告诉站长」兜底。当日预算熔断(503):整个对话区隐藏,关键词搜索不受影响。

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { ItemCard, type Item } from '@/components/ItemCard';
import { FeedbackCard, FeedbackLink } from '@/components/FeedbackCard';
import { useT, useLocale } from '@/i18n/I18nProvider';

interface Turn {
  id: number;
  user: string;
  summary: string;
  items: Item[];
  pending: boolean;
  error?: boolean;
  /** 11E:LLM 判定用户在问站务 → 显示「转给站长」卡片 */
  askOps?: boolean;
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
  ask,
  filters,
  cardProps,
  onClose,
}: {
  /** 顶部搜索栏交来的一句话;id 变一次发一次 */
  ask: { id: number; text: string };
  /** 当前筛选条件(与列表接口同名参数),对话检索沿用同一范围 */
  filters: Record<string, string>;
  cardProps: CardProps;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [disabledMsg, setDisabledMsg] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const seq = useRef(0);
  // 卸载(换搜索词 / 离开页面)时取消在途请求:不再消耗配额与模型费用,也不对已卸载组件 setState(Codex 互审 #9)
  const abortRef = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; abortRef.current?.abort(); };
  }, []);

  const patch = (id: number, p: Partial<Turn>) => { if (alive.current) setTurns(ts => ts.map(x => (x.id === id ? { ...x, ...p } : x))); };

  const send = async (raw: string) => {
    const message = raw.trim().slice(0, 300);
    if (!message || busy || disabledMsg) return;
    const id = ++seq.current;
    // 历史:已完成的轮次,最多 6 轮;助手侧只回传 summary(卡片由服务端重新检索,不信任客户端给的 id)
    const history = turns.filter(x => !x.pending && !x.error).slice(-MAX_HISTORY_TURNS)
      .flatMap(x => [{ role: 'user', content: x.user }, { role: 'assistant', content: x.summary }]);
    setTurns(ts => [...ts, { id, user: message, summary: '', items: [], pending: true }]);
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch('/api/search/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: 'items', message, history, filters }),
        signal: ac.signal,
      });
      if (!alive.current) return;
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
          if (ev.event === 'intent' && ev.data.intent === 'ask_ops') patch(id, { askOps: true });
          else if (ev.event === 'summary' && typeof ev.data.text === 'string') { summary += ev.data.text; patch(id, { summary }); }
          else if (ev.event === 'items') patch(id, { items: Array.isArray(ev.data.items) ? ev.data.items : [] });
        }
      }
      patch(id, { pending: false });
    } catch {
      if (!ac.signal.aborted) patch(id, { pending: false, error: true, summary: t('search.chatError') });
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  // 顶栏每交来一句新话就发一次。send 读的是当次渲染的 turns / busy,依赖只放 ask.id
  const sentId = useRef(0);
  useEffect(() => {
    if (ask.id === sentId.current) return;
    sentId.current = ask.id;
    void send(ask.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask.id]);

  if (hidden) return null;

  return (
    <section className="mb-5 rounded-lg border border-violet-100 bg-violet-50/40 p-3" data-testid="search-chat" aria-live="polite">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-600">
          <Sparkles size={12} className="text-violet-500" />
          {t('search.chatTitle')}
        </span>
        <button type="button" onClick={onClose} aria-label={t('search.chatClose')} className="p-1 -m-1 text-stone-400 hover:text-stone-600">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3">
        {turns.map(turn => (
          <div key={turn.id} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-brand text-white text-sm rounded-2xl rounded-br-sm px-3 py-2 break-words">{turn.user}</div>
            </div>
            <div className="flex justify-start">
              <div className={`max-w-[85%] text-sm rounded-2xl rounded-bl-sm px-3 py-2 break-words ${turn.error ? 'bg-rose-50 text-rose-700' : 'bg-white text-stone-800 border border-violet-100'}`}>
                <Sparkles size={12} className="inline mr-1 text-violet-500 align-[-1px]" />
                {turn.summary || (turn.pending ? t('search.chatThinking') : '')}
                {turn.pending && <span className="inline-block w-1.5 h-3 ml-0.5 bg-violet-400 align-[-1px] animate-pulse" />}
              </div>
            </div>
            {turn.askOps && !turn.pending && <FeedbackCard source="chat" initialMessage={turn.user} />}
            {turn.error && <FeedbackLink source="error" initialMessage={turn.user} />}
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

      <div className="text-[11px] text-stone-400 mt-2 px-1 flex flex-wrap items-center gap-x-2">
        <span>{disabledMsg ?? t('search.chatNote')}</span>
        {disabledMsg && <FeedbackLink source="limit" />}
      </div>
    </section>
  );
}
