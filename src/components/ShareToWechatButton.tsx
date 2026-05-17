'use client';

// Phase 3B.5 (updated): "分享到微信群"按钮
//
// 优先 Web Share API:在 iOS Safari / Android Chrome 上弹系统分享面板,
// 用户能直接选微信、AirDrop、iMessage 等;微信抓 url 的 OG meta 渲染卡片预览。
//
// 不支持 Web Share API 的环境(Desktop Firefox / 老浏览器 / 非 secure context)
// → fallback 到 clipboard 复制 share text。
//
// 视觉:小 outline chip 按钮(stone-100,Share2 icon)— 放在 EventCard 展开端
// 操作区,跟"查看原站" / "发送联系方式"并列(右侧次要操作)

import { Share2 } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';
import { buildEventShareText } from '@/lib/eventShareText';

type EventLike = {
  id: string;
  title: string;
  category: string | null;
  status?: string;
  maxAttendees?: number | null;
  responseCount?: number;
};

export function ShareToWechatButton({ event }: { event: EventLike }) {
  const handleShare = async () => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const text = buildEventShareText(event, origin);
    const url = `${origin}/localnews/event/${event.id}`;

    // 优先 Web Share API — 弹系统分享面板,用户可直接选微信
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: event.title,
          text,
          url,
        });
        return;
      } catch (err: unknown) {
        // 用户主动取消分享 — 不报错也不 fallback
        if (err instanceof Error && err.name === 'AbortError') return;
        // 其他错误 → 继续 fallback 到剪贴板
      }
    }

    // Fallback:复制到剪贴板(老浏览器 / 无 Web Share API 环境)
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('已复制,粘贴到微信群即可');
    } catch {
      showError('分享失败,请手动选中复制');
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-white text-stone-700 border border-stone-300 hover:bg-stone-50 active:scale-95 transition-all"
      aria-label="分享"
    >
      <Share2 size={12} strokeWidth={2.2} />
      分享
    </button>
  );
}
