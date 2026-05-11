'use client';

import { useState, useEffect } from 'react';
import { ImageUpload } from './ImageUpload';
import { BatchImportPanel } from './BatchImportPanel';
import { CATEGORIES, CONTACT_TYPES } from '@/lib/utils';
import { getStoredUtmSource } from '@/lib/utm';
import { useT } from '@/i18n/I18nProvider';
import type { Item } from './ItemCard';

const LS_LAST_CODE        = 'hb_last_edit_code';
const LS_LAST_CONTACT_T   = 'hb_my_contact_type';
const LS_LAST_CONTACT_V   = 'hb_my_contact_value';
const LS_LAST_CONTACT_LBL = 'hb_my_contact_label';
const LS_CODES_BY_ITEM    = 'hb_codes_by_item';

type Mode = 'create' | 'edit';

export function PostModal({
  mode,
  initialItem,
  onClose,
  onSaved,
}: {
  mode: Mode;
  initialItem?: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  // create 模式才显示 tab 切换；edit 模式始终走单条表单
  const [tab, setTab] = useState<'single' | 'batch'>('single');
  const [type,         setType]         = useState<'sell' | 'buy'>('sell');
  const [title,        setTitle]        = useState('');
  const [description,  setDescription]  = useState('');
  const [priceText,    setPriceText]    = useState('');
  const [negotiable,   setNegotiable]   = useState(false);
  const [category,     setCategory]     = useState<typeof CATEGORIES[number]['id']>('home');
  const [customTag,    setCustomTag]    = useState('');
  const [contactType,  setContactType]  = useState<'wechat' | 'phone' | 'email' | 'other'>('wechat');
  const [contactValue, setContactValue] = useState('');
  const [customLabel,  setCustomLabel]  = useState('');
  const [photoUrls,    setPhotoUrls]    = useState<string[]>([]);
  const [editCode,     setEditCode]     = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  useEffect(() => {
    if (mode === 'edit' && initialItem) {
      setType(initialItem.type);
      setTitle(initialItem.title);
      setDescription(initialItem.description);
      setPriceText(initialItem.price === null ? '' : String(initialItem.price));
      setNegotiable(initialItem.price === null);
      setCategory(initialItem.category as any);
      setCustomTag(initialItem.customTag ?? '');
      setContactType(initialItem.contactType as any);
      setContactValue(initialItem.contactValue);
      setCustomLabel(initialItem.customContactLabel ?? '');
      setPhotoUrls(initialItem.photoUrls);
      try {
        const byItem = JSON.parse(localStorage.getItem(LS_CODES_BY_ITEM) ?? '{}');
        const code = byItem[initialItem.id] || localStorage.getItem(LS_LAST_CODE) || '';
        setEditCode(code);
      } catch {}
    } else {
      try {
        const tp  = localStorage.getItem(LS_LAST_CONTACT_T);
        const v   = localStorage.getItem(LS_LAST_CONTACT_V);
        const l   = localStorage.getItem(LS_LAST_CONTACT_LBL);
        const c   = localStorage.getItem(LS_LAST_CODE);
        if (tp === 'wechat' || tp === 'phone' || tp === 'email' || tp === 'other') setContactType(tp);
        if (v) setContactValue(v);
        if (l) setCustomLabel(l);
        if (c) setEditCode(c);
      } catch {}
    }
  }, [mode, initialItem]);

  const submit = async () => {
    if (!title.trim()) return alert(t('post.errTitle'));
    if (!negotiable && (priceText === '' || isNaN(Number(priceText)))) return alert(t('post.errPrice'));
    if (!contactValue.trim()) return alert(t('post.errContact'));
    if (editCode.length < 6) return alert(t('post.errEditCode'));

    const payload = {
      type,
      title: title.trim(),
      description: description.trim(),
      price: negotiable ? null : Number(priceText),
      category,
      customTag: customTag.trim() || null,
      contactType,
      contactValue: contactValue.trim(),
      customContactLabel: contactType === 'other' ? (customLabel.trim() || null) : null,
      photoUrls,
      editCode,
      utmSource: mode === 'create' ? getStoredUtmSource() : undefined,
    };

    setSubmitting(true);
    try {
      const url    = mode === 'create' ? '/api/items' : `/api/items/${initialItem!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || t('post.errOpFailed')); return; }

      try {
        localStorage.setItem(LS_LAST_CODE, editCode);
        localStorage.setItem(LS_LAST_CONTACT_T, contactType);
        localStorage.setItem(LS_LAST_CONTACT_V, contactValue.trim());
        if (contactType === 'other') localStorage.setItem(LS_LAST_CONTACT_LBL, customLabel.trim());
        const itemId = mode === 'create' ? data.id : initialItem!.id;
        const byItem = JSON.parse(localStorage.getItem(LS_CODES_BY_ITEM) ?? '{}');
        byItem[itemId] = editCode;
        localStorage.setItem(LS_CODES_BY_ITEM, JSON.stringify(byItem));
      } catch {}

      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-start sm:items-center justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl my-4">
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-3 flex items-center justify-between rounded-t-lg z-10">
          <h2 className="text-lg font-semibold">
            {mode === 'create' ? t('post.titleCreate') : t('post.titleEdit')}
          </h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900 text-2xl leading-none">×</button>
        </div>

        {/* create 模式才显示 tab；edit 模式只走单条表单 */}
        {mode === 'create' && (
          <div className="border-b border-stone-200 px-5 flex gap-0">
            <TabBtn active={tab === 'single'} onClick={() => setTab('single')}>{t('batch.tabSingle')}</TabBtn>
            <TabBtn active={tab === 'batch'}  onClick={() => setTab('batch')}>{t('batch.tabBatch')}</TabBtn>
          </div>
        )}

        {mode === 'create' && tab === 'batch' ? (
          <div className="p-5">
            <BatchImportPanel onSuccess={onSaved} onClose={onClose} />
          </div>
        ) : (
        <div className="p-5 space-y-4">
          <div>
            <Label>{t('post.fieldType')}</Label>
            <div className="flex gap-2">
              {category === 'housing' ? (
                <>
                  <Pill active={type === 'sell'} onClick={() => setType('sell')}>🏠 {t('type.sublet')}</Pill>
                  <Pill active={type === 'buy'}  onClick={() => setType('buy')}>🔍 {t('type.rentwanted')}</Pill>
                </>
              ) : (
                <>
                  <Pill active={type === 'sell'} onClick={() => setType('sell')}>{t('post.typeSell')}</Pill>
                  <Pill active={type === 'buy'}  onClick={() => setType('buy')}>{t('post.typeBuy')}</Pill>
                </>
              )}
            </div>
          </div>

          <div>
            <Label>{t('post.fieldTitle')}</Label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={100}
              placeholder={
                category === 'housing'
                  ? (type === 'sell' ? t('post.titlePhSublet') : t('post.titlePhRentwanted'))
                  : (type === 'sell' ? t('post.titlePhSell')   : t('post.titlePhBuy'))
              }
              className="w-full border border-stone-300 rounded px-3 py-2"
            />
          </div>

          <div>
            <Label>{t('post.fieldPrice')}</Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                <span className="px-3 py-2 bg-stone-100 border border-r-0 border-stone-300 rounded-l">$</span>
                <input
                  type="number" inputMode="numeric"
                  min={0}
                  value={priceText}
                  onChange={e => setPriceText(e.target.value)}
                  disabled={negotiable}
                  placeholder="30"
                  className="w-32 border border-stone-300 rounded-r px-3 py-2 disabled:bg-stone-50 text-base"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={negotiable} onChange={e => setNegotiable(e.target.checked)} />
                {type === 'buy' ? t('post.byMessage') : t('post.negotiable')}
              </label>
            </div>
          </div>

          <div>
            <Label>{t('post.fieldCategory')}</Label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(c => (
                <Pill key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                  {t(c.i18nKey)}
                </Pill>
              ))}
            </div>
            {category === 'other' && (
              <input
                value={customTag}
                onChange={e => setCustomTag(e.target.value)}
                maxLength={20}
                placeholder={t('post.customTagPh')}
                className="mt-2 w-full border border-stone-300 rounded px-3 py-2 text-sm"
              />
            )}
          </div>

          <div>
            <Label>{t('post.fieldDesc')}</Label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={category === 'housing' ? t('post.descPhHousing') : t('post.descPh')}
              className="w-full border border-stone-300 rounded px-3 py-2"
            />
          </div>

          <div>
            <Label>{t('post.fieldPhotos')}</Label>
            <ImageUpload urls={photoUrls} onChange={setPhotoUrls} />
          </div>

          <div>
            <Label>{t('post.fieldContact')}</Label>
            <div className="flex gap-2 flex-wrap">
              <select
                value={contactType}
                onChange={e => setContactType(e.target.value as any)}
                className="border border-stone-300 rounded px-3 py-2"
              >
                {CONTACT_TYPES.map(c => (
                  <option key={c.id} value={c.id}>{t(c.i18nKey)}</option>
                ))}
              </select>
              {contactType === 'other' && (
                <input
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  maxLength={20}
                  placeholder={t('post.customLabelPh')}
                  className="border border-stone-300 rounded px-3 py-2 flex-1 min-w-[140px]"
                />
              )}
              <input
                value={contactValue}
                onChange={e => setContactValue(e.target.value)}
                placeholder={CONTACT_TYPES.find(c => c.id === contactType)?.placeholder}
                className="border border-stone-300 rounded px-3 py-2 flex-1 min-w-[180px]"
              />
            </div>
          </div>

          <div className="border-t border-stone-200 pt-4">
            <Label>{t('post.fieldEditCode')}</Label>
            <input
              value={editCode}
              onChange={e => setEditCode(e.target.value)}
              minLength={6}
              maxLength={50}
              type="text"
              placeholder={t('post.editCodePh')}
              className="w-full border border-stone-300 rounded px-3 py-2 font-mono"
            />
            <div className="text-xs text-stone-600 mt-2 bg-amber-50 border border-amber-200 rounded p-2 leading-relaxed">
              {t('post.editCodeHelp')}
            </div>
          </div>
        </div>
        )}

        {/* 单条模式才显示底部固定按钮；批量模式自带提交按钮 */}
        {(!(mode === 'create' && tab === 'batch')) && (
          <div className="sticky bottom-0 bg-white border-t border-stone-200 px-5 py-3 flex justify-end gap-2 rounded-b-lg">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-stone-300 rounded hover:bg-stone-100"
            >
              {t('post.cancel')}
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="px-5 py-2 bg-brand text-white rounded hover:bg-brand-dark disabled:opacity-50"
            >
              {submitting ? t('post.saving') : (mode === 'create' ? t('post.submitCreate') : t('post.submitEdit'))}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium text-stone-700 mb-1">{children}</div>;
}

function Pill({
  active, children, onClick,
}: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-sm ${
        active
          ? 'bg-brand text-white border-brand'
          : 'bg-white text-stone-700 border-stone-300 hover:border-brand'
      }`}
    >
      {children}
    </button>
  );
}

function TabBtn({
  active, children, onClick,
}: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 -mb-px ${
        active
          ? 'border-brand text-brand font-semibold'
          : 'border-transparent text-stone-500 hover:text-stone-800'
      }`}
    >
      {children}
    </button>
  );
}
