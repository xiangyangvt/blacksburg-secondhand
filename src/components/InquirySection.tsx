'use client';

import { useState } from 'react';
import { CopyButton } from './CopyButton';
import { contactTypeLabel, timeAgo, CONTACT_TYPES } from '@/lib/utils';
import { useT, useLocale } from '@/i18n/I18nProvider';

type Inquiry = {
  id: string;
  contactType: string;
  contactValue: string;
  customContactLabel: string | null;
  message: string;
  createdAt: string | Date;
};

export function InquirySection({
  itemId,
  inquiries,
  onInquiryAdded,
  onInquiryDeleted,
  onInquiryUpdated,
  onRequestSellerDelete,
}: {
  itemId: string;
  inquiries: Inquiry[];
  onInquiryAdded: () => void;
  onInquiryDeleted: () => void;
  onInquiryUpdated: () => void;
  onRequestSellerDelete: (inquiryId: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [contactType, setContactType] = useState<'wechat' | 'phone' | 'email' | 'other'>('wechat');
  const [contactValue, setContactValue] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="border-t border-stone-200 mt-3 pt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm text-stone-600 hover:text-brand flex items-center gap-1"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        {t('inq.toggle', { n: inquiries.length })}
      </button>

      {open && (
        <div className="mt-2 space-y-2 pl-4">
          {inquiries.map(inq => (
            <div key={inq.id} className="bg-stone-50 rounded p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-stone-600 text-xs mb-1">
                <span className="font-medium text-stone-800">
                  {contactTypeLabel(inq.contactType, inq.customContactLabel, locale)}: {inq.contactValue}
                </span>
                <CopyButton text={inq.contactValue} label="📋" />
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
