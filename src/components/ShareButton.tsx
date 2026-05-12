'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Share2, Check } from 'lucide-react';
import { useT } from '@/i18n/I18nProvider';
import { isWeChatInAppBrowser } from '@/lib/uaUtils';

/**
 * 通用分享按钮：复制一段微信友好的文本（标题 + 价格 + 链接）。
 * 链接自动带 utm_source=share 便于在 admin 渠道面板里追踪。
 *
 * 微信内嵌浏览器特殊处理：
 *   - 不走 navigator.share（iOS 里再分享回 WeChat 静默失败）
 *   - 直接复制带 ?focus=ID 定位的链接到剪贴板，弹"已复制，长按粘贴到聊天框"
 *   - 右上角微信原生分享留给"分享整个站"用，因为那条路径会丢失 ?focus= 参数
 */
export function ShareButton({
  shareText,
  className = '',
  label,
  icon,
}: {
  shareText: string;
  className?: string;
  label?: string;
  icon?: ReactNode;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [wechatCopied, setWeChatCopied] = useState(false);
  const [inWeChat, setInWeChat] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 客户端挂载后再检测 UA（避免 SSR/hydration 不一致）
  useEffect(() => {
    setInWeChat(isWeChatInAppBrowser());
  }, []);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 微信内嵌 iOS 等环境 clipboard API 可能失败：退回 textarea + execCommand
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // 微信内嵌浏览器：直接复制带 ?focus= 的链接，弹"已复制"提示
    if (inWeChat) {
      const ok = await copyToClipboard(shareText);
      if (ok) {
        setWeChatCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setWeChatCopied(false), 3000);
      } else {
        window.prompt('请长按选中后复制：', shareText);
      }
      return;
    }

    try {
      // 普通浏览器：优先用 navigator.share（手机原生分享）
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        try {
          await (navigator as any).share({ text: shareText });
          return;
        } catch {
          // 用户取消或 share 失败 → 退回复制
        }
      }
      const ok = await copyToClipboard(shareText);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } else {
        window.prompt(t('card.shareCopied'), shareText);
      }
    } catch {
      window.prompt(t('card.shareCopied'), shareText);
    }
  };

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-100 text-xs text-stone-700 whitespace-nowrap transition-colors ${className}`}
      >
        {(copied || wechatCopied) ? <Check size={14} className="text-emerald-600" /> : (icon ?? <Share2 size={14} />)}
        <span>{(copied || wechatCopied) ? t('card.shareCopied') : (label ?? t('card.share'))}</span>
      </button>

      {/* 微信里：复制成功后小气泡引导用户去粘贴 */}
      {wechatCopied && (
        <div
          className="absolute z-50 right-0 top-full mt-2 px-3 py-2 rounded-lg bg-stone-900 text-white text-xs shadow-overlay whitespace-nowrap"
          onClick={() => setWeChatCopied(false)}
        >
          已复制 · 长按聊天框粘贴
          <div className="absolute -top-1.5 right-4 w-3 h-3 bg-stone-900 rotate-45" />
        </div>
      )}
    </span>
  );
}
