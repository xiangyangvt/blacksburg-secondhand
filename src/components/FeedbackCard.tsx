'use client';

// Sprint 11E:「转给站长」卡片 —— 用户反馈 / 问运营的唯一提交界面
//
// 两种出现方式,都只在用户卡壳时:
//   1. 搜索栏对话里 LLM 判定 intent=ask_ops → 对话区就地出现,预填用户原话(可改)
//   2. 不依赖 AI 的兜底:零结果 / 对话报错 / 触发配额时的一行「遇到问题?告诉站长」(FeedbackLink)点开
// **必须用户点发送才提交**,不自动转发对话内容。回访方式选填,预填用户在站内留过的联系方式。

import { useEffect, useState } from 'react';
import { Check, MessageCircleQuestion } from 'lucide-react';
import { getSharedContact } from '@/lib/identity';
import { useT, useLocale } from '@/i18n/I18nProvider';

type Source = 'chat' | 'empty' | 'error' | 'limit';

export function FeedbackCard({ initialMessage = '', source }: { initialMessage?: string; source: Source }) {
  const t = useT();
  const locale = useLocale();
  const [message, setMessage] = useState(initialMessage);
  const [contact, setContact] = useState('');
  const [state, setState] = useState<'edit' | 'sending' | 'sent'>('edit');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = getSharedContact();
    if (c?.contactValue) setContact(c.contactValue);
  }, []);

  if (state === 'sent') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 flex items-center gap-2" data-testid="feedback-sent">
        <Check size={16} className="shrink-0" />
        {contact.trim() ? t('feedback.sentWithContact') : t('feedback.sent')}
      </div>
    );
  }

  const send = async () => {
    if (!message.trim() || state === 'sending') return;
    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, contact, source, page: window.location.pathname }),
      });
      if (res.ok) { setState('sent'); return; }
      const data = await res.json().catch(() => ({}));
      setError(data?.message?.[locale] ?? data?.error ?? t('feedback.error'));
    } catch {
      setError(t('feedback.error'));
    }
    setState('edit');
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void send(); }}
      className="rounded-lg border border-stone-200 bg-white p-3 space-y-2"
      data-testid="feedback-card"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
        <MessageCircleQuestion size={15} className="text-violet-500" />
        {t('feedback.title')}
      </div>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={t('feedback.messagePlaceholder')}
        aria-label={t('feedback.messagePlaceholder')}
        className="w-full bg-stone-50 border border-stone-200 rounded-md px-3 py-2 text-base md:text-sm focus:outline-none focus:border-violet-400 focus:bg-white resize-y"
      />
      <input
        value={contact}
        onChange={e => setContact(e.target.value)}
        maxLength={100}
        placeholder={t('feedback.contactPlaceholder')}
        aria-label={t('feedback.contactPlaceholder')}
        className="w-full bg-stone-50 border border-stone-200 rounded-md px-3 py-2 text-base md:text-sm focus:outline-none focus:border-violet-400 focus:bg-white"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={`text-[11px] ${error ? 'text-rose-600' : 'text-stone-400'}`}>{error ?? t('feedback.note')}</span>
        <button
          type="submit"
          disabled={!message.trim() || state === 'sending'}
          className="shrink-0 px-4 py-1.5 rounded-chip bg-stone-900 text-white text-sm font-medium disabled:bg-stone-300 transition-colors"
        >
          {state === 'sending' ? t('feedback.sending') : t('feedback.send')}
        </button>
      </div>
    </form>
  );
}

/** 卡壳时刻的一行兜底入口:平时只是一行灰字,点开才出现卡片 */
export function FeedbackLink({ source, initialMessage, className = '' }: { source: Source; initialMessage?: string; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (open) return <div className={`text-left ${className}`}><FeedbackCard source={source} initialMessage={initialMessage} /></div>;
  return (
    <button type="button" onClick={() => setOpen(true)} className={`text-xs text-stone-400 underline underline-offset-2 hover:text-stone-600 ${className}`} data-testid="feedback-link">
      {t('feedback.link')}
    </button>
  );
}
