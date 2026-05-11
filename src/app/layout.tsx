import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_SC } from 'next/font/google';
import { Providers } from './Providers';
import './globals.css';

// 变量字体 —— Inter Latin + Noto Sans SC 中文
// 走 next/font/google 自动子集化、自托管、零 layout-shift
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const notoSC = Noto_Sans_SC({
  // 中文不支持 'subsets' 但仍可用，next/font 会按需加载
  weight: ['400', '500', '700'],
  variable: '--font-noto-sc',
  display: 'swap',
});

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
  // 保留用户主动 pinch zoom 能力（看大图、放大照片要用）；
  // 防"聚焦 input 自动 zoom"通过 globals.css 的 font-size:16px 实现，不靠禁掉缩放
  themeColor: '#7B1113',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${notoSC.variable}`}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
