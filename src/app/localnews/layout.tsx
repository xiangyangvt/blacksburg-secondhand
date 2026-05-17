import type { Metadata } from 'next';

// /localnews 子路由 metadata —— 覆盖根 layout 的 title / description / OG,
// 让分享到微信 / iMessage 时卡片标题反映"本地活动 + 信息流",而不是站根名。
//
// 注意:Next.js metadata 是 shallow merge,openGraph / twitter 对象会**整体覆盖**
// 父 layout 的对应字段,所以这里需要把要的字段写全(type / locale / url / siteName 等)。
//
// 本 layout 是纯 pass-through server component;不影响 page.tsx 的 'use client'。
// /localnews/event/[id]/page.tsx 自带 generateMetadata,会进一步覆盖本 layout。

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL
  || 'https://blacksburg-secondhand-production.up.railway.app';

const PAGE_NAME = '黑堡本地活动 · Blacksburg Local';
const PAGE_DESC = '黑堡 (Blacksburg, VA) 本地华人活动召集 + 生活互助。组麻将、拼车机场、求接机、找搭子...';

export const metadata: Metadata = {
  title: PAGE_NAME,
  description: PAGE_DESC,
  openGraph: {
    title: PAGE_NAME,
    description: PAGE_DESC,
    type: 'website',
    locale: 'zh_CN',
    alternateLocale: 'en_US',
    url: `${SITE_URL}/localnews`,
    siteName: '黑堡本地活动',
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_NAME,
    description: PAGE_DESC,
  },
};

export default function LocalnewsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
