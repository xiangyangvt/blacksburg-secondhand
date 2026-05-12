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
 *   navigator.share 在微信里走 iOS 系统 share → 用户选 WeChat → 静默失败（WeChat 不让自分享自）。
 *   所以微信内嵌浏览器里，点按钮改成弹一个气泡引导用户使用右上角 ⋯ 菜单（走 WeChat 原生分享路径，OG scrape 完美）。
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
  const [showWeChatHint, setShowWeChatHint] = useState(false);
  const [inWeChat, setInWeChat] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 客户端挂载后再检测 UA（避免 SSR/hydration 不一致）
  useEffect(() => {
    setInWeChat(isWeChatInAppBrowser());
  }, []);

  // 卸载时清掉定时器
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // 微信内嵌浏览器：直接弹提示气泡，引导走右上角菜单
    if (inWeChat) {
      setShowWeChatHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setShowWeChatHint(false), 5000);
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
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // 写剪贴板失败（HTTP / iframe 等），降级 prompt
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
        {copied ? <Check size={14} className="text-emerald-600" /> : (icon ?? <Share2 size={14} />)}
        <span>{copied ? t('card.shareCopied') : (label ?? t('card.share'))}</span>
      </button>

      {/* 微信里点按钮 → 弹气泡引导（指向右上角） */}
      {showWeChatHint && (
        <div
          className="absolute z-50 right-0 top-full mt-2 w-64 p-3 rounded-lg bg-stone-900 text-white text-xs shadow-overlay leading-relaxed"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-semibold mb-1">在微信里分享</div>
          <div className="text-stone-300">
            请点屏幕右上角 <strong className="text-white">⋯</strong> 菜单 → <strong className="text-white">「发送给朋友」</strong> 或 <strong className="text-white">「分享到朋友圈」</strong>，分享出去的卡片才有图。
          </div>
          <button
            onClick={() => setShowWeChatHint(false)}
            className="mt-2 text-stone-400 hover:text-white underline text-[10px]"
          >
            知道了
          </button>
          {/* 小箭头指向按钮 */}
          <div className="absolute -top-1.5 right-4 w-3 h-3 bg-stone-900 rotate-45" />
        </div>
      )}
    </span>
  );
}
