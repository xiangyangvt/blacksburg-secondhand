import type { Metadata, Viewport } from 'next';
import { Providers } from './Providers';
import './globals.css';

const SITE_NAME = '黑堡二手买卖 · Blacksburg Secondhand';
const SITE_DESC = '黑堡（Blacksburg, VA）本地华人/学生二手物品交易平台。Local secondhand marketplace for the Blacksburg, VA community.';

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESC,
  manifest: '/manifest.json',
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESC,
    type: 'website',
    locale: 'zh_CN',
    alternateLocale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: SITE_NAME,
    description: SITE_DESC,
  },
  appleWebApp: {
    capable: true,
    title: '黑堡二手',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    // iOS 主屏图标也用 SVG（现代 iOS 支持；旧版会用截图作 fallback）
    apple: [{ url: '/icon.svg' }],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#7B1113',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
