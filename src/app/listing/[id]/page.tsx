// 单 listing detail RSC 路由
// 设计：分享出去的链接是 /listing/[id]，微信 scrape 走这里拿 OG meta
// 用户实际打开（含微信 scrape 完展示）后 redirect 到 /roommates?focus=ID
// 这样保持扁平化（用户体验里仍然是 /roommates），但 microSEO 体验有专属 OG

import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  || 'https://blacksburg-secondhand-production.up.railway.app';

const TYPE_LABEL: Record<string, string> = {
  find_roommate: '有房找室友',
  co_rent:       '找队友合租',
  sublet:        '转租',
  summer:        '暑期短租',
};

async function loadListing(id: string) {
  const l = await prisma.listing.findUnique({
    where: { id },
    select: {
      id: true, type: true, title: true, description: true,
      budgetMin: true, budgetMax: true, areas: true, photoUrls: true,
      status: true,
    },
  });
  if (!l || l.status !== 'active') return null;
  return l;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const l = await loadListing(params.id);
  if (!l) return { title: 'Listing 不存在 · 黑堡二手买卖', robots: { index: false } };

  const typeText = TYPE_LABEL[l.type] ?? l.type;
  const budget = (() => {
    const a = l.budgetMin, b = l.budgetMax;
    if (a === null && b === null) return '面议';
    if (a !== null && b !== null && a === b) return `$${a}/月`;
    if (a !== null && b !== null) return `$${a}–${b}/月`;
    if (a !== null) return `$${a}+/月`;
    return `≤$${b}/月`;
  })();
  let areaStr = '';
  try {
    const arr = JSON.parse(l.areas);
    if (Array.isArray(arr) && arr.length > 0) areaStr = ' · ' + arr.slice(0, 2).join('/');
  } catch {}

  const title = `${l.title} · ${budget} · 黑堡室友 & 租房`;
  const rawDesc = l.description?.replace(/\s+/g, ' ').trim() ?? '';
  const description = rawDesc.length > 0
    ? rawDesc.slice(0, 140)
    : `【${typeText}】${budget}${areaStr}`;

  // og:image 用同源代理（绕开微信对 Cloudinary 的不稳）；末尾 ?v=N 用于 bust 微信缓存
  const OG_IMG_VERSION = '1';
  const cover = `${SITE_URL}/api/og/listing/${l.id}?v=${OG_IMG_VERSION}`;

  return {
    title,
    description,
    openGraph: {
      title, description,
      type: 'website',
      locale: 'zh_CN',
      images: [{ url: cover, width: 1200, height: 1200, type: 'image/jpeg', alt: l.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title, description,
      images: [cover],
    },
    icons: { apple: [{ url: cover, type: 'image/jpeg' }] },
    other: { 'image': cover },
  };
}

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const l = await loadListing(params.id);
  if (!l) notFound();
  // 拿完 metadata 后 redirect 到 /roommates?focus=ID
  // 这样用户体验仍然是"扁平化的 /roommates 主页 + 自动展开该卡片"
  redirect(`/roommates?focus=${params.id}&og=v1`);
}
