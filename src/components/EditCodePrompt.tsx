'use client';

import { useState, useEffect } from 'react';
import { useT } from '@/i18n/I18nProvider';
import { HelpHint } from './HelpHint';
import { RecoveryRequestModal, type RecoveryTarget } from './RecoveryRequestModal';

const LS_LAST_CODE     = 'hb_last_edit_code';
const LS_CODES_BY_ITEM = 'hb_codes_by_item';
const LS_CONTACT_VALUE = 'hb_my_contact_value';

export function EditCodePrompt({
  itemId,
  title,
  action,
  onConfirm,
  onCancel,
  targetType = 'item',
}: {
  itemId: string;
  title: string;
  action: string; // 已经本地化好的字符串（"编辑" / "标记已售出 / 删除" / ...）
  onConfirm: (code: string) => void | Promise<void>;
  onCancel: () => void;
  /** UX-5 找回回路:传 'listing' 用于室友页面;'event' 用于黑堡活动;默认 'item' 二手 */
  targetType?: 'item' | 'listing' | 'event';
}) {
  const t = useT();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [knownContact, setKnownContact] = useState<string>('');

  useEffect(() => {
    try {
      const byItem = JSON.parse(localStorage.getItem(LS_CODES_BY_ITEM) ?? '{}');
      const c = byItem[itemId] || localStorage.getItem(LS_LAST_CODE) || '';
      if (c) setCode(c);
      // 找回 modal 预填本机记忆的联系方式
      const cv = localStorage.getItem(LS_CONTACT_VALUE) ?? '';
      if (cv) setKnownContact(cv);
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
        <div className="flex items-center gap-1.5 mb-2">
          <h3 className="font-semibold">{t('code.promptTitle', { action })}</h3>
          <HelpHint label="忘了密码怎么办?">
            <p>密码是发布时自己设的,我们加密保存,看不到。</p>
            <p>如果丢了:</p>
            <ul className="list-disc list-inside text-stone-600 space-y-1">
              <li>这台设备上次发的会自动预填</li>
              <li>换设备或清浏览器缓存需要重新设</li>
              <li>用联系方式 + 密码可以在「我的」找回未售出的帖子,如果连密码都忘了请走人工找回</li>
            </ul>
          </HelpHint>
        </div>
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
        <p className="text-xs text-stone-500 mb-1">{t('code.help')}</p>
        <p className="text-xs text-stone-500 mb-3">
          忘了?{' '}
          <button
            type="button"
            onClick={() => setRecoveryOpen(true)}
            className="text-brand underline hover:text-brand-dark font-medium"
          >
            申请找回 →
          </button>
        </p>
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
      {recoveryOpen && (
        <RecoveryRequestModal
          target={{
            type: targetType,
            id: itemId,
            title,
            knownContactValue: knownContact || undefined,
          }}
          onClose={() => setRecoveryOpen(false)}
        />
      )}
    </div>
  );
}
