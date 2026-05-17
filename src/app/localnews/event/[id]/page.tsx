// /localnews/event/[id] — Event 详情 SSR 页(分享落地页)
//
// 设计:微信抓 OG 走这条 server-rendered 路由,有 generateMetadata 返 og:image
// 指到 /api/og/event/[id]。用户实际打开看到 EventCard 自动展开版本 + "返回黑堡"链接。
//
// 跟 /listing/[id] 不同的是:这里不 redirect 到 /localnews?focus=ID,因为我们
// 希望分享出来的链接打开就直接看到这个活动 — /localnews 的列表/筛选状态对单个
// 活动的展示价值不大。日后如果需要 deep link 进列表,可以再加 "← 返回黑堡" 跳。

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { EventCard, type EventCardData } from '@/components/EventCard';

export const dynamic = 'force-dynamic';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://blacksburg-secondhand-production.up.railway.app';

// 给 og:image URL 加个版本号,大改 OG 卡片后 bump 一次让微信重抓
const OG_IMG_VERSION = '1';

type LoadedEvent = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

async function loadEvent(id: string) {
  const ev = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      source: true,
      sourceUrl: true,
      title: true,
      titleOriginal: true,
      description: true,
      startAt: true,
      endAt: true,
      publishedAt: true,
      location: true,
      category: true,
      customCategory: true,
      imageUrl: true,
      photoUrls: true,
      clickCount: true,
      scrapedAt: true,
      status: true,
      maxAttendees: true,
      posterNickname: true,
      posterContactType: true,
      posterContact: true,
      posterContactLabel: true,
      posterContactPublic: true,
    },
  });
  if (!ev) return null;
  // 已删除 / 已隐藏 不可见
  if (ev.status === 'deleted' || ev.status === 'hidden') return null;
  return ev;
}

async function loadResponseCount(eventId: string): Promise<number> {
  return prisma.eventContactSend.count({
    where: { eventId, status: { not: 'canceled' } },
  });
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const ev = await loadEvent(params.id);
  if (!ev) {
    return {
      title: '活动不存在 · 黑堡',
      robots: { index: false },
    };
  }

  const title = `${ev.title} · 黑堡`;
  // 描述:摘要 + 时间;尽量纯文本利于微信摘要展示
  const parts: string[] = [];
  if (ev.description) {
    parts.push(ev.description.replace(/\s+/g, ' ').trim().slice(0, 100));
  }
  if (ev.startAt) {
    const d = ev.startAt;
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    parts.push(`${m}月${day}日 ${hh}:${mm}`);
  }
  if (ev.location) {
    parts.push(ev.location);
  }
  const description =
    parts.length > 0
      ? parts.join(' · ').slice(0, 160)
      : '黑堡本地活动 / 求助';

  const ogImage = `${SITE_URL}/api/og/event/${ev.id}?v=${OG_IMG_VERSION}`;

  return {
    title,
    description,
    openGraph: {
      title: ev.title,
      description,
      type: 'website',
      locale: 'zh_CN',
      images: [
        { url: ogImage, width: 1200, height: 630, type: 'image/png', alt: ev.title },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: ev.title,
      description,
      images: [ogImage],
    },
  };
}

/** prisma 行 → EventCardData(parse photoUrls,strip 敏感字段已在 select 里做掉) */
function toCardData(ev: LoadedEvent, responseCount: number): EventCardData {
  let photoUrls: string[] = [];
  if (ev.photoUrls) {
    try {
      const arr = JSON.parse(ev.photoUrls);
      if (Array.isArray(arr)) photoUrls = arr.filter((u: any) => typeof u === 'string');
    } catch {}
  }
  return {
    id: ev.id,
    source: ev.source,
    sourceUrl: ev.sourceUrl,
    title: ev.title,
    titleOriginal: ev.titleOriginal,
    description: ev.description,
    startAt: ev.startAt ? ev.startAt.toISOString() : null,
    endAt: ev.endAt ? ev.endAt.toISOString() : null,
    publishedAt: ev.publishedAt ? ev.publishedAt.toISOString() : null,
    location: ev.location,
    category: ev.category,
    imageUrl: ev.imageUrl,
    clickCount: ev.clickCount,
    scrapedAt: ev.scrapedAt ? ev.scrapedAt.toISOString() : null,
    customCategory: ev.customCategory,
    posterNickname: ev.posterNickname,
    posterContactType: ev.posterContactType,
    posterContact: ev.posterContact,
    posterContactLabel: ev.posterContactLabel,
    posterContactPublic: ev.posterContactPublic,
    photoUrls,
    maxAttendees: ev.maxAttendees,
    status: ev.status,
    responseCount,
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ev = await loadEvent(params.id);
  if (!ev) notFound();

  const responseCount = await loadResponseCount(ev.id);
  const card = toCardData(ev, responseCount);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <Link
        href="/localnews"
        className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-brand mb-4 no-underline"
      >
        <ChevronLeft size={16} strokeWidth={2.2} />
        返回黑堡
      </Link>

      {/* grid wrap 跟 /localnews 卡片占位一致,EventCard 在 expanded 状态下 col-span-2 md:col-span-1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EventCard event={card} autoExpand={true} />
      </div>
    </main>
  );
}
