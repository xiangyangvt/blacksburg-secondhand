// 单商品 detail 页：用于微信群分享深链
// RSC：服务端拉取，注入 OG metadata 给微信预览卡用
// 渲染主体在 ItemDetailView (client) 里，含交互（lightbox、询价、分享）

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { parsePhotoUrls } from '@/lib/utils';
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
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'zh_CN',
      images: photos.length > 0 ? [{ url: photos[0] }] : undefined,
    },
    twitter: {
      card: photos.length > 0 ? 'summary_large_image' : 'summary',
      title,
      description,
    },
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
