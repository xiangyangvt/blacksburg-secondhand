import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '服务条款 · 黑堡二手买卖',
  description: '使用本站的基本规则:禁止事项、批量采集、责任范围。',
  robots: { index: true, follow: true },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
