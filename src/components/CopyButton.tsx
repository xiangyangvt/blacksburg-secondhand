'use client';

import { useState } from 'react';
import { useT } from '@/i18n/I18nProvider';

/** 经典"两矩形重叠"复制图标——Mac/Windows/Office 通用，认知度高 */
const CopyIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24" width={size} height={size}
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/** 复制成功对勾 */
const CheckIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24" width={size} height={size}
    fill="none" stroke="currentColor" strokeWidth="2.6"
    strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export function CopyButton({
  text,
  label,
  copiedLabel,
  className = '',
  size = 'sm',
}: {
  text: string;
  /** 可选——给个文字标签会显示在图标右边；不给就是纯图标按钮 */
  label?: string;
  /** 复制成功后的文字（仅当 label 给了才显示）。默认 ✓ 已复制 */
  copiedLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 兜底：iOS 老版 Safari 偶尔失败
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sizeCls = size === 'md'
    ? 'px-3 py-1.5 text-sm gap-1.5'
    : 'px-2 py-1 text-xs gap-1';
  const iconSize = size === 'md' ? 16 : 13;
  const showCopiedLabel = copiedLabel ?? t('card.copied');

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center justify-center ${sizeCls} rounded border border-stone-300 bg-white hover:bg-stone-100 active:bg-stone-200 ${copied ? 'copied-pop bg-green-50 border-green-400 text-green-700' : ''} ${className}`}
      title={text}
      aria-label={label || `复制 ${text}`}
    >
      {copied ? <CheckIcon size={iconSize} /> : <CopyIcon size={iconSize} />}
      {label && <span>{copied ? showCopiedLabel : label}</span>}
    </button>
  );
}
