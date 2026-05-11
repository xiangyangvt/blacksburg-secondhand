'use client';

import { useState, useRef, useEffect } from 'react';
import { CopyButton } from './CopyButton';
import { contactTypeLabel, timeAgo, CONTACT_TYPES } from '@/lib/utils';
import { useT, useLocale } from '@/i18n/I18nProvider';

const LS_LAST_CODE = 'hb_last_edit_code';

type Inquiry = {
  id: string;
  contactType: string;
  contactValue: string;
  customContactLabel: string | null;
  message: string;
  sellerReply: string | null;
  sellerRepliedAt: string | Date | null;
  createdAt: string | Date;
};

export function InquirySection({
  itemId,
  inquiries,
  onInquiryAdded,
  onInquiryDeleted,
  onInquiryUpdated,
  onRequestSellerDelete,
  onOpenChange,
}: {
  itemId: string;
  inquiries: Inquiry[];
  onInquiryAdded: () => void;
  onInquiryDeleted: () => void;
  onInquiryUpdated: () => void;
  onRequestSellerDelete: (inquiryId: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpenRaw] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [contactType, setContactType] = useState<'wechat' | 'phone' | 'email' | 'other'>('wechat');
  const [contactValue, setContactValue] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 卖家回复状态：当前正在回复哪条 inquiry
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyCode, setReplyCode] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);

  const sectionRef = useRef<HTMLDivElement>(null);

  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    setOpenRaw(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      onOpenChange?.(next);
      return next;
    });
  };

  // 展开时自动滚动到询价区，让用户立即看到留言列表
  // 等 2 帧给布局完成（卡片可能从单列变全宽 col-span-2）
  useEffect(() => {
    if (!open || !sectionRef.current) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
    );
  }, [open]);

  const submit = async () => {
    if (!contactValue.trim() || !message.trim()) {
      alert(t('inq.errEmpty'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/items/${itemId}/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactType,
          contactValue: contactValue.trim(),
          customContactLabel: contactType === 'other' ? customLabel.trim() || null : null,
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t('inq.errSend')); return; }
      try {
        localStorage.setItem('hb_my_contact_type',  contactType);
        localStorage.setItem('hb_my_contact_value', contactValue.trim());
        if (contactType === 'other') localStorage.setItem('hb_my_contact_label', customLabel.trim());
      } catch {}
      setMessage('');
      setShowForm(false);
      onInquiryAdded();
    } finally {
      setSubmitting(false);
    }
  };

  const deleteSelf = async (inq: Inquiry) => {
    const cv = prompt(t('inq.confirmContact', {
      label: contactTypeLabel(inq.contactType, inq.customContactLabel, locale),
      value: inq.contactValue,
    }));
    if (!cv) return;
    const res = await fetch(`/api/inquiries/${inq.id}?contactValue=${encodeURIComponent(cv)}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || t('inq.errDelete'));
      return;
    }
    onInquiryDeleted();
  };

  const editSelf = async (inq: Inquiry) => {
    const cv = prompt(t('inq.confirmContact', {
      label: contactTypeLabel(inq.contactType, inq.customContactLabel, locale),
      value: inq.contactValue,
    }));
    if (!cv) return;
    const newMsg = prompt(t('inq.editPrompt'), inq.message);
    if (!newMsg || !newMsg.trim()) return;
    const res = await fetch(`/api/inquiries/${inq.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: newMsg.trim(), contactValue: cv }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || t('inq.errEdit'));
      return;
    }
    onInquiryUpdated();
  };

  const openForm = () => {
    setShowForm(true);
    try {
      const tp = localStorage.getItem('hb_my_contact_type');
      const v  = localStorage.getItem('hb_my_contact_value');
      const l  = localStorage.getItem('hb_my_contact_label');
      if (tp === 'wechat' || tp === 'phone' || tp === 'email' || tp === 'other') setContactType(tp);
      if (v) setContactValue(v);
      if (l) setCustomLabel(l);
    } catch {}
  };

  // 打开"卖家回复"表单：预填上次用过的识别码
  const openReplyForm = (inq: Inquiry) => {
    setReplyingId(inq.id);
    setReplyText(inq.sellerReply ?? '');
    try {
      const c = localStorage.getItem(LS_LAST_CODE) ?? '';
      setReplyCode(c);
    } catch {}
  };

  const submitReply = async () => {
    if (!replyingId) return;
    if (!replyText.trim()) { alert(t('inq.errEmpty')); return; }
    if (replyCode.length < 6) { alert(t('post.errEditCode')); return; }
    setReplySubmitting(true);
    try {
      const res = await fetch(`/api/inquiries/${replyingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemEditCode: replyCode,
          sellerReply: replyText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t('reply.errSend')); return; }
      try { localStorage.setItem(LS_LAST_CODE, replyCode); } catch {}
      setReplyingId(null);
      setReplyText('');
      onInquiryUpdated();
    } finally {
      setReplySubmitting(false);
    }
  };

  const deleteReply = async (inq: Inquiry) => {
    if (!confirm(t('reply.confirmDelete'))) return;
    let code = '';
    try { code = localStorage.getItem(LS_LAST_CODE) ?? ''; } catch {}
    code = prompt(t('code.placeholder'), code) ?? '';
    if (!code) return;
    const res = await fetch(`/api/inquiries/${inq.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemEditCode: code, sellerReply: '' }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || t('inq.errDelete')); return; }
    onInquiryUpdated();
  };

  return (
    <div ref={sectionRef} className="border-t border-stone-200 mt-3 pt-2 scroll-mt-24">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm text-stone-600 hover:text-brand flex items-center gap-1"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        {t('inq.toggle', { n: inquiries.length })}
      </button>

      {open && (
        <div className="mt-2 space-y-3 pl-2 md:pl-4">
          {inquiries.map(inq => (
            <div key={inq.id} className="bg-stone-50 rounded p-2 text-sm space-y-1.5">
              {/* 买家留言 */}
              <div>
                <div className="flex flex-wrap items-center gap-2 text-stone-600 text-xs mb-1">
                  <span className="font-medium text-stone-800">
                    {contactTypeLabel(inq.contactType, inq.customContactLabel, locale)}: {inq.contactValue}
                  </span>
                  <CopyButton text={inq.contactValue} />
                  <span className="text-stone-400">·</span>
                  <span>{timeAgo(inq.createdAt, locale)}</span>
                  <span className="ml-auto flex gap-1">
                    <button onClick={() => editSelf(inq)} className="text-stone-500 hover:text-brand text-xs">{t('inq.editMy')}</button>
                    <button onClick={() => deleteSelf(inq)} className="text-stone-500 hover:text-red-600 text-xs">{t('inq.deleteMy')}</button>
                    <button onClick={() => onRequestSellerDelete(inq.id)} className="text-stone-400 hover:text-red-600 text-xs">{t('inq.deleteSeller')}</button>
                  </span>
                </div>
                <div className="text-stone-800">{inq.message}</div>
              </div>

              {/* 卖家回复（如果有） */}
              {inq.sellerReply && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 ml-4">
                  <div className="flex items-center gap-2 text-xs text-amber-800 mb-0.5">
                    <span className="font-semibold">↳ {t('reply.label')}</span>
                    {inq.sellerRepliedAt && (
                      <span className="text-amber-600">{timeAgo(inq.sellerRepliedAt, locale)}</span>
                    )}
                    <span className="ml-auto flex gap-1">
                      <button onClick={() => openReplyForm(inq)} className="text-amber-700 hover:text-amber-900 text-xs">{t('reply.edit')}</button>
                      <button onClick={() => deleteReply(inq)} className="text-amber-700 hover:text-red-700 text-xs">{t('reply.delete')}</button>
                    </span>
                  </div>
                  <div className="text-stone-800 whitespace-pre-wrap">{inq.sellerReply}</div>
                </div>
              )}

              {/* "卖家回复"按钮（没回复时才显示） */}
              {!inq.sellerReply && replyingId !== inq.id && (
                <button
                  onClick={() => openReplyForm(inq)}
                  className="text-xs text-amber-700 hover:text-amber-900 ml-4"
                >
                  {t('reply.btn')}
                </button>
              )}

              {/* 卖家回复表单 */}
              {replyingId === inq.id && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 ml-4 space-y-2">
                  <div className="text-xs text-amber-800 font-medium">↳ {t('reply.label')}</div>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder={t('reply.placeholder')}
                    rows={2}
                    maxLength={500}
                    className="w-full border border-amber-300 rounded px-2 py-1 text-sm bg-white"
                  />
                  <input
                    value={replyCode}
                    onChange={e => setReplyCode(e.target.value)}
                    placeholder={t('reply.codePlaceholder')}
                    type="text"
                    className="w-full border border-amber-300 rounded px-2 py-1 text-xs font-mono bg-white"
                  />
                  <div className="flex gap-2 text-sm">
                    <button
                      onClick={submitReply}
                      disabled={replySubmitting}
                      className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 text-xs"
                    >
                      {replySubmitting ? t('inq.sending') : t('reply.send')}
                    </button>
                    <button
                      onClick={() => { setReplyingId(null); setReplyText(''); }}
                      className="px-3 py-1 border border-stone-300 rounded hover:bg-stone-100 text-xs"
                    >
                      {t('reply.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!showForm && (
            <button
              onClick={openForm}
              className="text-sm text-brand hover:text-brand-dark"
            >
              {t('inq.add')}
            </button>
          )}

          {showForm && (
            <div className="bg-stone-50 rounded p-3 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <select
                  value={contactType}
                  onChange={e => setContactType(e.target.value as any)}
                  className="border border-stone-300 rounded px-2 py-1 text-sm"
                >
                  {CONTACT_TYPES.map(c => (
                    <option key={c.id} value={c.id}>{t(c.i18nKey)}</option>
                  ))}
                </select>
                {contactType === 'other' && (
                  <input
                    placeholder={t('post.customLabelPh')}
                    value={customLabel}
                    onChange={e => setCustomLabel(e.target.value)}
                    className="border border-stone-300 rounded px-2 py-1 text-sm flex-1 min-w-[120px]"
                  />
                )}
                <input
                  placeholder={CONTACT_TYPES.find(c => c.id === contactType)?.placeholder}
                  value={contactValue}
                  onChange={e => setContactValue(e.target.value)}
                  className="border border-stone-300 rounded px-2 py-1 text-sm flex-1 min-w-[160px]"
                />
              </div>
              <textarea
                placeholder={t('inq.placeholderMsg')}
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full border border-stone-300 rounded px-2 py-1 text-sm"
              />
              <div className="flex gap-2 text-sm">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="px-3 py-1 bg-brand text-white rounded hover:bg-brand-dark disabled:opacity-50"
                >
                  {submitting ? t('inq.sending') : t('inq.send')}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1 border border-stone-300 rounded hover:bg-stone-100"
                >
                  {t('inq.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
