// GET /api/og/listing/[id]  ——  同源 og:image 代理（listing 版）
// 跟 /api/og/[id]（item 版）同套路：把 Cloudinary 图通过 server 流回，让微信抓到同源 URL

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toCloudinaryThumb } from '@/lib/cloudinary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { photoUrls: true, status: true },
  });

  if (!listing || listing.status !== 'active') {
    return new NextResponse(TRANSPARENT_GIF, {
      status: 404,
      headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=60' },
    });
  }

  let photos: string[] = [];
  try {
    const arr = JSON.parse(listing.photoUrls);
    if (Array.isArray(arr)) photos = arr.filter(x => typeof x === 'string');
  } catch {}

  if (photos.length === 0) {
    return new NextResponse(TRANSPARENT_GIF, {
      status: 200,
      headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=60' },
    });
  }

  const cloudinaryUrl = toCloudinaryThumb(photos[0], 1200, 'jpg');

  try {
    const upstream = await fetch(cloudinaryUrl, {
      headers: { 'user-agent': 'blacksburg-secondhand/og-proxy' },
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

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);
