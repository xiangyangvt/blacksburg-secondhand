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
      className="fixed left-4 bottom-5 z-20 w-11 h-11 rounded-full bg-white border border-stone-300 shadow-lg flex items-center justify-center hover:bg-stone-50 active:bg-stone-100"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M5 12 L10 7 L15 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
