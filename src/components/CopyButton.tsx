'use client';

import { useState } from 'react';
import { useT } from '@/i18n/I18nProvider';

export function CopyButton({
  text,
  label,
  copiedLabel,
  className = '',
  size = 'sm',
}: {
  text: string;
  label?: string;
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
    ? 'px-3 py-1.5 text-sm'
    : 'px-2 py-1 text-xs';

  const showLabel = label ?? '📋';
  const showCopiedLabel = copiedLabel ?? t('card.copied');

  return (
    <button
      onClick={handleClick}
      className={`${sizeCls} rounded border border-stone-300 bg-white hover:bg-stone-100 active:bg-stone-200 ${copied ? 'copied-pop bg-green-50 border-green-400 text-green-700' : ''} ${className}`}
      title={text}
    >
      {copied ? showCopiedLabel : showLabel}
    </button>
  );
}
