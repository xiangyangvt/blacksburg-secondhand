'use client';

// 法律页通用渲染(Sprint 9B):按当前语言渲染 zh / en 两套内容。
// 内容是清楚的告知,不是法律文书;措辞尽量短句。

import Link from 'next/link';
import { useLocale } from '@/i18n/I18nProvider';

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalContent = { title: string; updated: string; intro?: string; sections: LegalSection[] };

export function LegalPage({ zh, en }: { zh: LegalContent; en: LegalContent }) {
  const locale = useLocale();
  const c = locale === 'en' ? en : zh;
  return (
    <main className="max-w-2xl mx-auto px-4 py-8 text-stone-800">
      <Link href="/" className="text-sm text-brand hover:underline">← {locale === 'en' ? 'Home' : '返回首页'}</Link>
      <h1 className="text-2xl font-bold mt-3 mb-1">{c.title}</h1>
      <p className="text-xs text-stone-500 mb-6">{c.updated}</p>
      {c.intro && <p className="text-sm md:text-base mb-6">{c.intro}</p>}
      {c.sections.map(s => (
        <section key={s.heading} className="mb-6">
          <h2 className="text-lg font-semibold mb-2">{s.heading}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="text-sm md:text-base leading-relaxed mb-2 whitespace-pre-line">{p}</p>
          ))}
        </section>
      ))}
      <nav className="text-xs text-stone-500 border-t border-stone-200 pt-4 mt-8 flex gap-4">
        <Link href="/privacy" className="hover:underline">{locale === 'en' ? 'Privacy' : '隐私政策'}</Link>
        <Link href="/terms" className="hover:underline">{locale === 'en' ? 'Terms' : '服务条款'}</Link>
      </nav>
    </main>
  );
}
