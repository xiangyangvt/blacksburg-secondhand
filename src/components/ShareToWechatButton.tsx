'use client';

// Phase 3B.5: "复制到微信群"按钮
// 点击 → 把 buildEventShareText 的结果写到剪贴板 → toast 提示
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
  const handleCopy = async () => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const text = buildEventShareText(event, origin);
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('已复制,粘贴到微信群即可');
    } catch {
      showError('复制失败,请手动选中');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-chip text-xs font-medium bg-stone-100 text-stone-700 border border-stone-300 hover:bg-stone-200 active:scale-95 transition-all"
      aria-label="复制到微信群"
    >
      <Share2 size={12} strokeWidth={2.2} />
      复制到微信群
    </button>
  );
}
