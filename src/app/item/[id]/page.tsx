// 单商品 detail 页：用于微信群分享深链
// RSC：服务端拉取，注入 OG metadata 给微信预览卡用
// 渲染主体在 ItemDetailView (client) 里，含交互（lightbox、询价、分享）

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { parsePhotoUrls } from '@/lib/utils';
import { toCloudinaryThumb } from '@/lib/cloudinary';
import { ItemDetailView } from '@/components/ItemDetailView';

export const dynamic = 'force-dynamic'; // 商品状态变化频繁，不缓存

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
  const description = item.description?.slice(0, 140) || `${item.title}，黑堡本地华人/学生二手交易`;

  // 微信兼容性优化：
  // 1. 用 Cloudinary 转成 1200×1200 JPG —— 强制 jpg 而不是 webp，微信/QQ 的图片渲染对 webp 仍偶发不稳
  // 2. 显式 width / height 让微信知道图片尺寸（部分版本要求）
  // 3. 同时输出 Twitter Card（其他平台 + 个别国内 scraper 也读 twitter:image）
  const cover = photos.length > 0 ? toCloudinaryThumb(photos[0], 1200, 'jpg') : null;

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
    // 给微信"description"传统 meta 兜底（个别老版本不读 og:description）
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
    contactValue: item.contactValue,
    customContactLabel: item.customContactLabel,
    photoUrls: parsePhotoUrls(item.photoUrls),
    createdAt: item.createdAt.toISOString(),
    inquiries: item.inquiries.map(inq => ({
      ...inq,
      createdAt: inq.createdAt.toISOString(),
      sellerRepliedAt: inq.sellerRepliedAt?.toISOString() ?? null,
    })) as any,
  };

  return <ItemDetailView item={serialized} />;
}
