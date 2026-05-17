'use client';

import { useState, useEffect } from 'react';
import { X, Copy } from 'lucide-react';
import { ImageUpload } from './ImageUpload';
import { BatchImportPanel } from './BatchImportPanel';
import { CATEGORIES, CONTACT_TYPES } from '@/lib/utils';
import { getStoredUtmSource } from '@/lib/utm';
import { useT } from '@/i18n/I18nProvider';
import { showError, showWarning, showSuccess } from '@/lib/toast';
import { validateContact, contactPlaceholder, validatePriceSoft } from '@/lib/contactValidation';
import { HelpHint } from './HelpHint';
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
    if (!title.trim()) return showError(t('post.errTitle'));
    if (!negotiable && (priceText === '' || isNaN(Number(priceText)))) return showError(t('post.errPrice'));
    if (!contactValue.trim()) return showError(t('post.errContact'));
    if (editCode.length < 6) return showError(t('post.errEditCode'));

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
      if (!res.ok) { showError(data.error || t('post.errOpFailed')); return; }

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
      <div className="bg-white rounded-card w-full max-w-2xl my-4">
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-3 flex items-center justify-between rounded-t-card z-10">
          <h2 className="text-lg font-semibold">
            {mode === 'create' ? t('post.titleCreate') : t('post.titleEdit')}
          </h2>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100"
            aria-label="关闭"
          ><X size={22} /></button>
        </div>

        {/* create 模式 + 桌面端才显示 tab；手机端整条 tab 隐藏（批量导入只在电脑上） */}
        {mode === 'create' && (
          <div className="hidden md:flex border-b border-stone-200 px-5 gap-0">
            <TabBtn active={tab === 'single'} onClick={() => setTab('single')}>{t('batch.tabSingle')}</TabBtn>
            <TabBtn active={tab === 'batch'}  onClick={() => setTab('batch')}>{t('batch.tabBatch')}</TabBtn>
          </div>
        )}

        {mode === 'create' && tab === 'batch' ? (
          <>
            {/* 桌面：批量面板 */}
            <div className="hidden md:block p-5">
              <BatchImportPanel onSuccess={onSaved} onClose={onClose} />
            </div>
            {/* 手机 fallback：用户用 dev tools 强切窗口大小时才会到这里；提示用电脑 */}
            <div className="md:hidden p-5 text-center text-sm text-stone-600">
              <p className="mb-2">📥 批量导入只支持电脑端访问</p>
              <button onClick={() => setTab('single')} className="text-brand underline">
                切回单条发布
              </button>
            </div>
          </>
        ) : (
        <div className="p-5 space-y-4">
          <div>
            <Label>{t('post.fieldType')}</Label>
            <div className="flex gap-2">
              <Pill active={type === 'sell'} onClick={() => setType('sell')}>{t('post.typeSell')}</Pill>
              <Pill active={type === 'buy'}  onClick={() => setType('buy')}>{t('post.typeBuy')}</Pill>
            </div>
          </div>

          <div>
            <Label>{t('post.fieldTitle')}</Label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={100}
              placeholder={type === 'sell' ? t('post.titlePhSell') : t('post.titlePhBuy')}
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
                  max={99999}
                  value={priceText}
                  onChange={e => setPriceText(e.target.value)}
                  onBlur={() => {
                    const n = Number(priceText);
                    if (!Number.isFinite(n)) return;
                    const r = validatePriceSoft(n);
                    if (!r.ok && r.warning) showWarning(r.warning);
                  }}
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
              placeholder={t('post.descPh')}
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
                onBlur={() => {
                  const r = validateContact(contactType, contactValue);
                  if (!r.ok && r.warning) showWarning(r.warning);
                }}
                placeholder={contactPlaceholder(contactType)}
                className="border border-stone-300 rounded px-3 py-2 flex-1 min-w-[180px]"
              />
            </div>
          </div>

          <div className="border-t border-stone-200 pt-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Label>{t('post.fieldEditCode')}</Label>
              <HelpHint label="什么是密码?">
                <p><strong>"联系方式 + 密码" = 你管理这条发布的凭证。</strong></p>
                <p>改 / 删 / 查"我的"都要用。我们加密保存,自己也看不到 —— 丢了无法找回,但可以凭联系方式申请人工找回。</p>
                <p className="text-stone-500">✓ 这台设备会自动记住,下次发布预填。换设备或清浏览器缓存就要重新设。</p>
              </HelpHint>
            </div>
            <div className="flex gap-2">
              <input
                value={editCode}
                onChange={e => setEditCode(e.target.value)}
                minLength={6}
                maxLength={50}
                type="text"
                placeholder={t('post.editCodePh')}
                className="flex-1 min-w-0 border border-stone-300 rounded px-3 py-2 font-mono"
              />
              {editCode.length >= 6 && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(editCode);
                      showSuccess('密码已复制');
                    } catch {
                      showError('复制失败,请手动选中');
                    }
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium bg-stone-100 text-stone-700 rounded hover:bg-stone-200 flex-shrink-0"
                  title="复制密码"
                >
                  <Copy size={12} />
                  复制
                </button>
              )}
            </div>
            <div className="text-xs text-stone-600 mt-1.5 leading-relaxed">
              ⚠️ "联系方式 + 密码" = 你管理这条发布的凭证。改 / 删 / 查"我的"都要用。<br />
              我们加密保存,自己也看不到 —— <strong>丢了无法找回</strong>,但可以凭联系方式申请人工找回。
            </div>
          </div>
        </div>
        )}

        {/* 单条模式才显示底部固定按钮；批量模式自带提交按钮 */}
        {(!(mode === 'create' && tab === 'batch')) && (
          <div className="sticky bottom-0 bg-white border-t border-stone-200 px-5 py-3 flex justify-end gap-2 rounded-b-card">
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
