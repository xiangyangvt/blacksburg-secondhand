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

  // description = 卖家填的商品描述摘要（按 Sean 要求只放摘要，不带类目/价格前缀）
  // 没填描述时兜底一句中性话，避免 description 字段为空导致微信不渲染副文本
  const rawDesc = item.description?.replace(/\s+/g, ' ').trim() ?? '';
  const description = rawDesc.length > 0
    ? rawDesc.slice(0, 140)
    : `黑堡二手买卖 · ${item.type === 'sell' ? '出售' : '求购'} · ${priceText}`;

  // 微信兼容性优化：
  // 1. 用 Cloudinary 转成 1200×1200 JPG —— 强制 jpg 而不是 webp，微信/QQ 的图片渲染对 webp 仍偶发不稳
  // 2. 显式 width / height 让微信知道图片尺寸（部分版本要求）
  // 3. 同时输出 Twitter Card（其他平台 + 个别国内 scraper 也读 twitter:image）
  // 4. og:image URL 末尾追加 ?ogv=4 cache buster：微信对图片 URL 也独立缓存，必须改 URL 字符串才能让它重抓
  //    （Cloudinary 忽略未知 query，图片内容不变；只是让 URL 字符串跟旧的不一样）
  const OG_IMG_VERSION = '4';
  const coverRaw = photos.length > 0 ? toCloudinaryThumb(photos[0], 1200, 'jpg') : null;
  const cover = coverRaw ? `${coverRaw}?ogv=${OG_IMG_VERSION}` : null;

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
