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
  // Noto Sans SC 在 Google Fonts 没有"chinese"这种命名 subset（只有 latin/latin-ext/cyrillic/vietnamese），
  // 所以 next/font 不让 preload。改成 preload: false：字体仍然自托管 + 通过 CSS 加载，
  // 第一次中文渲染会有极轻微的 FOUT（用 PingFang/Microsoft YaHei 兜底，~100ms 后换 Noto），之后浏览器缓存
  weight: ['400', '500', '700'],
  variable: '--font-noto-sc',
  display: 'swap',
  preload: false,
});

const SITE_NAME = '黑堡二手买卖 · Blacksburg Secondhand';
const SITE_DESC = '黑堡（Blacksburg, VA）本地华人/学生二手物品交易平台。Local secondhand marketplace for the Blacksburg, VA community.';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  || 'https://blacksburg-secondhand-production.up.railway.app';

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESC,
  manifest: '/manifest.json',
  // 关键：所有 OG / Twitter Card 的相对路径都基于这个绝对 URL 解析
  // 不设的话 build 时默认 http://localhost:3000，导致微信抓的 OG 图 URL 是 localhost，预览没图
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESC,
    type: 'website',
    locale: 'zh_CN',
    alternateLocale: 'en_US',
    url: SITE_URL,
    siteName: '黑堡二手买卖',
  },
  twitter: {
    card: 'summary_large_image', // 主页 OG 是 1200×630 大图，对应 summary_large_image
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
