// 单商品 detail 页：用于微信群分享深链
// RSC：服务端拉取，注入 OG metadata 给微信预览卡用
// 渲染主体在 ItemDetailView (client) 里，含交互（lightbox、询价、分享）

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { parsePhotoUrls } from '@/lib/utils';
import { ItemDetailView } from '@/components/ItemDetailView';

export const dynamic = 'force-dynamic'; // 商品状态变化频繁，不缓存

// og:image 用同源代理（/api/og/[id]）—— 微信抓 Cloudinary 不稳，换成 Railway 自己域
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  || 'https://blacksburg-secondhand-production.up.railway.app';

async function loadItem(id: string) {
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      inquiries: {
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!item || item.status !== 'active') return null;
  return item;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const item = await loadItem(params.id);
  if (!item) {
    return {
      title: '商品不存在 · 黑堡二手买卖',
      robots: { index: false },
    };
  }
  const photos = parsePhotoUrls(item.photoUrls);
  const priceText = item.price === null ? '面议' : `$${item.price}`;
  const title = `${item.title} — ${priceText} · 黑堡二手买卖`;

  // description = 卖家填的商品描述摘要（按 Sean 要求只放摘要，不带类目/价格前缀）
  // 没填描述时兜底一句中性话，避免 description 字段为空导致微信不渲染副文本
  const rawDesc = item.description?.replace(/\s+/g, ' ').trim() ?? '';
  const description = rawDesc.length > 0
    ? rawDesc.slice(0, 140)
    : `黑堡二手买卖 · ${item.type === 'sell' ? '出售' : '求购'} · ${priceText}`;

  // 微信兼容性优化 v5：用我们自己的同源代理端点 /api/og/[id]
  // 之前指 Cloudinary 微信内置 scraper 抓不到（推测墙内/被强缓存），换成 Railway 同源 URL
  // 微信对同源 URL 没历史缓存 → 必然重新抓 → 拿到我们代理的真图
  // OG_IMG_VERSION 用于"图换了想强制 bust 缓存"时 bump（写在 URL 末尾 ?v=N）
  const OG_IMG_VERSION = '5';
  const cover = photos.length > 0
    ? `${SITE_URL}/api/og/${item.id}?v=${OG_IMG_VERSION}`
    : null;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'zh_CN',
      images: cover
        ? [{
            url: cover,
            width: 1200,
            height: 1200,
            type: 'image/jpeg',
            alt: item.title,
          }]
        : undefined,
    },
    twitter: {
      card: cover ? 'summary_large_image' : 'summary',
      title,
      description,
      images: cover ? [cover] : undefined,
    },
    // iOS Safari 系统分享 sheet 优先用 apple-touch-icon 作为预览缩略图
    // root layout 的 apple-touch-icon 是 SVG（iOS share sheet 不识别），单商品页 override 成商品图
    // 微信收到 iOS share 包时，缩略图字段拿到的就是 og 代理返回的 JPG
    icons: cover ? {
      apple: [{ url: cover, type: 'image/jpeg' }],
    } : undefined,
    other: cover ? {
      'image': cover,
    } : undefined,
  };
}

export default async function ItemDetailPage({ params }: { params: { id: string } }) {
  const item = await loadItem(params.id);
  if (!item) notFound();

  // 序列化给 client 组件用
  const serialized = {
    id: item.id,
    type: item.type as 'sell' | 'buy',
    title: item.title,
    description: item.description,
    price: item.price,
    category: item.category,
    customTag: item.customTag,
    contactType: item.contactType,
    contactValue: '',  // 隐私：默认隐藏，点"查看联系方式"按钮才会调 API 拿
    customContactLabel: null,
    photoUrls: parsePhotoUrls(item.photoUrls),
    createdAt: item.createdAt.toISOString(),
    inquiries: item.inquiries.map(inq => ({
      ...inq,
      createdAt: inq.createdAt.toISOString(),
      sellerRepliedAt: inq.sellerRepliedAt?.toISOString() ?? null,
      // 留言人联系方式也脱敏：用户点"查看联系方式"才会调 API 拿
      contactValue: '',
      customContactLabel: null,
    })) as any,
  };

  return <ItemDetailView item={serialized} />;
}
