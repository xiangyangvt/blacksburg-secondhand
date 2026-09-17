'use client';

// 发布表单联系方式字段下的可见性告知(Sprint 9B)。不加勾选框:Reactance 规避,给提示不阻止。
// public=true 的场景(活动的「公开联系方式」开关)用另一句措辞。

import Link from 'next/link';
import { useT } from '@/i18n/I18nProvider';

export function ContactVisibleHint({ variant = 'always' }: { variant?: 'always' | 'public' }) {
  const t = useT();
  return (
    <p className="mt-1 text-[11px] leading-snug text-stone-400">
      {t(variant === 'public' ? 'post.contactVisibleHintPublic' : 'post.contactVisibleHint')}{' '}
      <Link href="/privacy" target="_blank" className="underline hover:text-stone-600">{t('post.privacyLink')}</Link>
    </p>
  );
}
