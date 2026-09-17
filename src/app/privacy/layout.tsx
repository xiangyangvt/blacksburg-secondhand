import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隐私政策 · 黑堡二手买卖',
  description: '我们收集什么、谁能看到你的联系方式、如何删除。',
  robots: { index: true, follow: true },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
