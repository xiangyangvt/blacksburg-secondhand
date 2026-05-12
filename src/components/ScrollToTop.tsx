'use client';

import { useEffect, useState } from 'react';

/** 滚动 > 400px 后右下角浮现回顶部按钮 */
export function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="回到顶部"
      // 半透明 + backdrop-blur：浮在卡片上不会"压住"内容；hover 恢复实色
      className="fixed left-5 bottom-5 z-20 w-14 h-14 rounded-full bg-white/80 backdrop-blur-sm border border-stone-300 shadow-lg flex items-center justify-center hover:bg-white active:bg-stone-100 transition-colors"
    >
      {/* 上箭头 + 顶部横线 = 跳到最顶（媒体播放器风格） */}
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5"  y1="4"  x2="19" y2="4"  />
        <polyline points="6 12 12 6 18 12" />
        <line x1="12" y1="6"  x2="12" y2="20" />
      </svg>
    </button>
  );
}
