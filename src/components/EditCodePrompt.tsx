'use client';

import { useState, useEffect } from 'react';
import { useT } from '@/i18n/I18nProvider';

const LS_LAST_CODE     = 'hb_last_edit_code';
const LS_CODES_BY_ITEM = 'hb_codes_by_item';

export function EditCodePrompt({
  itemId,
  title,
  action,
  onConfirm,
  onCancel,
}: {
  itemId: string;
  title: string;
  action: string; // 已经本地化好的字符串（"编辑" / "标记已售出 / 删除" / ...）
  onConfirm: (code: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const byItem = JSON.parse(localStorage.getItem(LS_CODES_BY_ITEM) ?? '{}');
      const c = byItem[itemId] || localStorage.getItem(LS_LAST_CODE) || '';
      if (c) setCode(c);
    } catch {}
  }, [itemId]);

  const handle = async () => {
    if (!code) return;
    setSubmitting(true);
    try {
      await onConfirm(code);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-sm p-5">
        <h3 className="font-semibold mb-2">{t('code.promptTitle', { action })}</h3>
        <p className="text-sm text-stone-600 mb-3">
          {t('code.itemLabel')}<strong>{title}</strong>
        </p>
        <input
          autoFocus
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handle()}
          placeholder={t('code.placeholder')}
          className="w-full border border-stone-300 rounded px-3 py-2 font-mono mb-3"
        />
        <p className="text-xs text-stone-500 mb-3">{t('code.help')}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 border border-stone-300 rounded hover:bg-stone-100">
            {t('code.cancel')}
          </button>
          <button
            onClick={handle}
            disabled={submitting || !code}
            className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-dark disabled:opacity-50"
          >
            {submitting ? t('code.verifying') : t('code.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
