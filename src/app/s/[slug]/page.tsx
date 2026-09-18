// Sprint 11A:/s/<slug> —— 长图二维码的落点
//
// 二维码里的 URL 越短越好扫,所以单独给一条短路径;打开后服务端跳到主页 + 卖家筛选
// (沿用 shareText.ts 的「网站只有一个主页」原则,同 /listing/[id] 的做法)。
// utm_source=wx_poster:归因微信长图带来的访问。
// 摊位不存在(slug 打错)→ 不 404,直接回主页:扫码的人什么都没做错。

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { parseShelfSlug, resolveShelfContact } from '@/lib/shelf';

export const dynamic = 'force-dynamic';

async function countActive(slug: string | undefined): Promise<number | null> {
  if (!slug) return null;
  const contact = await resolveShelfContact(slug, prisma);
  if (contact === null) return null;
  return prisma.item.count({ where: { contactValue: contact, status: 'active', NOT: { category: 'housing' } } });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const n = await countActive(parseShelfSlug(params.slug));
  if (n === null) return { title: '黑堡二手买卖', robots: { index: false } };
  const title = `这位卖家的 ${n} 件在售 · 黑堡二手买卖`;
  // 摊位页不进搜索引擎:它是卖家自己分享的入口,不是公开目录
  return { title, description: '黑堡本地二手,免登录,扫码看详情、联系卖家。', robots: { index: false }, openGraph: { title } };
}

export default async function ShelfRedirect({ params }: { params: { slug: string } }) {
  const slug = parseShelfSlug(params.slug);
  const n = await countActive(slug);
  if (n === null) redirect('/');
  redirect(`/?shelf=${slug}&utm_source=wx_poster`);
}
