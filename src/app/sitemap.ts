// 动态 sitemap：主页 + /roommates + 所有 active item / listing 的 detail/focus URL
// Next.js 14 App Router 约定：app/sitemap.ts 自动生成 /sitemap.xml

import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  || 'https://blacksburg-secondhand-production.up.railway.app';

export const revalidate = 3600; // 1 小时缓存

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 静态页面
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`,          lastModified: new Date(), changeFrequency: 'hourly',  priority: 1.0 },
    { url: `${SITE_URL}/roommates`, lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.9 },
  ];

  // 动态：所有 active item（/item/[id] 详情页 + 主页 ?focus=ID）
  // 用 bumpedAt 作 lastModified，更准确反映"何时活跃"
  let items: Array<{ id: string; bumpedAt: Date }> = [];
  let listings: Array<{ id: string; bumpedAt: Date }> = [];
  try {
    items = await prisma.item.findMany({
      where: { status: 'active' },
      select: { id: true, bumpedAt: true },
      take: 1000,
    });
    listings = await prisma.listing.findMany({
      where: { status: 'active' },
      select: { id: true, bumpedAt: true },
      take: 500,
    });
  } catch {
    // DB 出错时返回静态部分即可
  }

  const itemPages: MetadataRoute.Sitemap = items.map(it => ({
    url: `${SITE_URL}/item/${it.id}`,
    lastModified: it.bumpedAt,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  const listingPages: MetadataRoute.Sitemap = listings.map(l => ({
    url: `${SITE_URL}/listing/${l.id}`,
    lastModified: l.bumpedAt,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [...staticPages, ...itemPages, ...listingPages];
}
