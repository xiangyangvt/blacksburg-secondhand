'use client';

import { Toaster } from 'sonner';
import { I18nProvider } from '@/i18n/I18nProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      {children}
      {/* 全站 toast —— alert() 的现代替代,top-center 桌面/移动通吃 */}
      <Toaster position="top-center" richColors closeButton duration={3500} />
    </I18nProvider>
  );
}
