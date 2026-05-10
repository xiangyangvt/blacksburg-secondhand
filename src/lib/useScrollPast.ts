'use client';

import { useEffect, useState } from 'react';

/** 监听窗口滚动是否超过阈值 px。返回 boolean。 */
export function useScrollPast(threshold = 50): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > threshold);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return past;
}
