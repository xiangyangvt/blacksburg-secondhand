import type { Metadata } from 'next';

// /roommates 子路由 metadata —— 覆盖根 layout 的 title / description / OG,
// 让分享到微信 / iMessage 时卡片标题反映室友&转租平台,而不是站根名。
//
// 注意:Next.js metadata 是 shallow merge,openGraph / twitter 对象会**整体覆盖**
// 父 layout 的对应字段,所以这里需要把要的字段写全(type / locale / url / siteName 等)。
//
// 本 layout 是纯 pass-through server component;不影响 page.tsx 的 'use client'。

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL
  || 'https://blacksburg-secondhand-production.up.railway.app';

const PAGE_NAME = '黑堡室友/转租 · Blacksburg Roommates';
const PAGE_DESC = '黑堡 (Blacksburg, VA) 本地华人 / 学生找室友、合租、转租、暑期短租。免登录,识别码即用。';

export const metadata: Metadata = {
  title: PAGE_NAME,
  description: PAGE_DESC,
  openGraph: {
    title: PAGE_NAME,
    description: PAGE_DESC,
    type: 'website',
    locale: 'zh_CN',
    alternateLocale: 'en_US',
    url: `${SITE_URL}/roommates`,
    siteName: '黑堡室友/转租',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_NAME,
    description: PAGE_DESC,
  },
};

export default function RoommatesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
