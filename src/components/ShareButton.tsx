'use client';

import { useState } from 'react';
import { useT } from '@/i18n/I18nProvider';

/**
 * 通用分享按钮：复制一段微信友好的文本（标题 + 价格 + 链接）。
 * 链接自动带 utm_source=share 便于在 admin 渠道面板里追踪。
 */
export function ShareButton({
  shareText,
  className = '',
  label,
}: {
  /** 已经组装好的可粘贴文本（含标题、价格、链接） */
  shareText: string;
  className?: string;
  /** 按钮文案，不传则用默认 i18n 的"🔗 分享" */
  label?: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // 优先用 navigator.share（手机原生分享）
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        try {
          await (navigator as any).share({ text: shareText });
          return;
        } catch {
          // 用户取消或 share 失败 → 退回复制
        }
      }
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // 写剪贴板失败（HTTP / iframe 等），降级 prompt
      window.prompt(t('card.shareCopied'), shareText);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-xs text-stone-700 whitespace-nowrap ${className}`}
    >
      {copied ? t('card.shareCopied') : (label ?? t('card.share'))}
    </button>
  );
}
