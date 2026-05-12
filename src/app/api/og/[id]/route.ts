// GET /api/og/[id]  ——  同源 og:image 代理
//
// 背景：微信 scraper 在墙内对 res.cloudinary.com 抓取不稳（实测 curl 用微信 UA 都能 200，
// 但微信内置 scraper 拿不到图，长期缓存"无图"）。让 og:image 改指向 Railway 自己的域名，
// 微信 scraper 抓 Railway 同源 URL 没墙问题，能拿到图。
//
// 服务端代理：拿 item 的封面图 → 用 Cloudinary transformation 取 1200x1200 JPG →
// 用 fetch 拉 image bytes → 把 buffer 流回客户端，content-type: image/jpeg
//
// 缓存：1 年 immutable —— 因为 itemId 是 cuid，改图会换 publicId，但 itemId 不变。
// 如果想强制 bust 缓存，可以加 ?v=N 查询，比如 og:image URL 模板里维护 OG_IMG_VERSION

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parsePhotoUrls } from '@/lib/utils';
import { toCloudinaryThumb } from '@/lib/cloudinary';

export const runtime = 'nodejs';        // 不用 edge：需要 prisma
export const dynamic = 'force-dynamic'; // 取决于 item 当前的 photoUrls

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;

  const item = await prisma.item.findUnique({
    where: { id },
    select: { photoUrls: true, status: true },
  });

  if (!item || item.status !== 'active') {
    // 没图也返回个透明 1x1 GIF，避免微信抓到 404 / HTML 报错
    return new NextResponse(TRANSPARENT_GIF, {
      status: 404,
      headers: {
        'content-type': 'image/gif',
        'cache-control': 'public, max-age=60',
      },
    });
  }

  const photos = parsePhotoUrls(item.photoUrls);
  if (photos.length === 0) {
    return new NextResponse(TRANSPARENT_GIF, {
      status: 200,
      headers: {
        'content-type': 'image/gif',
        'cache-control': 'public, max-age=60',
      },
    });
  }

  // 用 Cloudinary 边缘做 transformation（1200x1200 JPG），再 server side fetch
  const cloudinaryUrl = toCloudinaryThumb(photos[0], 1200, 'jpg');

  try {
    const upstream = await fetch(cloudinaryUrl, {
      headers: { 'user-agent': 'blacksburg-secondhand/og-proxy' },
      // Cloudinary CDN 内容 immutable，但我们这层代理也不持久存
      cache: 'no-store',
    });
    if (!upstream.ok) {
      return new NextResponse(TRANSPARENT_GIF, {
        status: 502,
        headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=60' },
      });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'image/jpeg',
        'content-length': String(buf.length),
        // 长缓存：item 改图后 publicId 会变；前端 url 末尾也带 ?v=N，bust 时改 N 即可
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse(TRANSPARENT_GIF, {
      status: 502,
      headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=60' },
    });
  }
}

// 透明 1x1 GIF（43 字节）—— 找不到图时兜底
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);
