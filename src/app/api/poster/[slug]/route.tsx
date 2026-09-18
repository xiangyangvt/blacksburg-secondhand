// Sprint 11C:GET /api/poster/<slug>?page=N   →  image/png(1080 宽的长图)
//
// 卖家摊位的长图:每件在售物品一行(照片 / 标题 / 价格 / 标签 / 描述摘要),底部一个二维码 → /s/<slug>。
// **必须是服务端出的真实 PNG 地址**:微信内置浏览器里只能长按 <img> 保存,canvas 下载按钮不可用。
// 内容全部原样取自帖子、只含公开信息(不含联系方式);不经 AI。
//
// 跑在 nodejs runtime(要直接用 Prisma;活动 OG 卡走 edge 是因为它要快,这里是用户主动点一次)。
// 中文字体:向 Google Fonts 要一份**只含本图用到的字**的 TTF 子集(css2 的 text= 参数;satori 不认 woff2,
//   所以用不带现代 UA 的请求拿 truetype)。按字集缓存在进程内。拿不到字体 → 503,不出一张全是豆腐块的图。
// 照片:先由服务端取回转成 data URI 再交给 satori——单张取不到就用占位块,不让一张坏图拖垮整张长图。
//   **只取 Cloudinary 的图**(lib/poster.ts 的 posterPhotoUrl 把关):photoUrls 是用户提交的字符串,任意 URL 都取就是 SSRF。
//   取图不跟随重定向。
// 配额:同 IP 60 次 / 小时(渲染吃 CPU)。bot UA 403。

import { ImageResponse } from '@vercel/og';
import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { checkQuota, isBotUA } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils';
import { parseShelfSlug, resolveShelfContact } from '@/lib/shelf';
import {
  toPosterRow, pageSlice, glyphSet, posterHeight,
  POSTER_WIDTH, ROW_HEIGHT, HEADER_HEIGHT, FOOTER_HEIGHT, type PosterRow,
} from '@/lib/poster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://blacksburg-secondhand-production.up.railway.app').replace(/\/$/, '');
const BRAND = '#7B1113';
const MAX_ITEMS = 200;
const FETCH_TIMEOUT_MS = 8_000;

const T = {
  site: '黑堡二手买卖',
  sub: 'Blacksburg 本地 · 免登录',
  heading: (n: number) => `我的 ${n} 件在售`,
  pageOf: (p: number, n: number) => `第 ${p} / ${n} 张`,
  scan: '长按识别二维码',
  scanSub: '看详情 · 联系卖家 · 看看全站在售',
  noPhoto: '无图',
};

// ---------- 字体 ----------

const fontCache = new Map<string, ArrayBuffer>();
const FONT_CACHE_MAX = 50;

async function loadFont(text: string, weight: 400 | 700): Promise<ArrayBuffer | null> {
  const key = `${weight}:${text}`;
  const hit = fontCache.get(key);
  if (hit) return hit;
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@${weight}&text=${encodeURIComponent(text)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }, // 不带浏览器 UA:Google 返回 truetype
    ).then(r => (r.ok ? r.text() : ''));
    const url = css.match(/src:\s*url\((https:\/\/[^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (fontCache.size >= FONT_CACHE_MAX) fontCache.delete(fontCache.keys().next().value!);
    fontCache.set(key, buf);
    return buf;
  } catch {
    return null;
  }
}

// ---------- 照片 ----------

async function toDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(jpeg|png)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2_000_000) return null;
    return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// ---------- 版式 ----------

const PHOTO = 260;

function Row({ row, photo, last }: { row: PosterRow; photo: string | null; last: boolean }) {
  return (
    <div style={{ display: 'flex', height: ROW_HEIGHT, padding: '30px 0', borderBottom: last ? 'none' : '2px solid #e7e5e4', alignItems: 'center' }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img src={photo} width={PHOTO} height={PHOTO} style={{ borderRadius: 20, objectFit: 'cover' }} />
      ) : (
        <div style={{ display: 'flex', width: PHOTO, height: PHOTO, borderRadius: 20, background: '#f5f5f4', color: '#a8a29e', fontSize: 30, alignItems: 'center', justifyContent: 'center' }}>
          {T.noPhoto}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 36, height: PHOTO, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: '#fff', background: row.typeLabel === '求购' ? '#c2410c' : BRAND, borderRadius: 999, padding: '4px 16px' }}>{row.typeLabel}</div>
            {row.tag ? <div style={{ display: 'flex', fontSize: 24, color: '#57534e', background: '#f5f5f4', borderRadius: 999, padding: '4px 16px', marginLeft: 12 }}>{row.tag}</div> : null}
          </div>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#1c1917', marginTop: 14, lineHeight: 1.25 }}>{row.title}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#78716c', lineHeight: 1.35 }}>{row.info}</div>
        <div style={{ display: 'flex', fontSize: 48, fontWeight: 700, color: BRAND }}>{row.priceText}</div>
      </div>
    </div>
  );
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  if (isBotUA(req, 'full')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const slug = parseShelfSlug(params.slug);
  const contact = slug ? await resolveShelfContact(slug, prisma) : null;
  if (!slug || contact === null) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const quota = await checkQuota({ key: `poster:ip:${getClientIp(req)}:h`, windowMs: 3600e3, max: 60 });
  if (!quota.ok) return NextResponse.json({ error: '生成太频繁了,过一会儿再试。' }, { status: 429, headers: { 'Retry-After': String(quota.retryAfterSec) } });

  const items = await prisma.item.findMany({
    where: { contactValue: contact, status: 'active', NOT: { category: 'housing' } },
    orderBy: [{ type: 'desc' }, { bumpedAt: 'desc' }], // sell 在前,buy 在后
    take: MAX_ITEMS,
    select: { id: true, type: true, title: true, description: true, price: true, category: true, customTag: true, photoUrls: true },
  });
  if (items.length === 0) return NextResponse.json({ error: '没有在售物品' }, { status: 404 });

  const all = items.map(toPosterRow);
  const { page, pages, rows } = pageSlice(all, Number(req.nextUrl.searchParams.get('page') ?? '1'));

  const heading = T.heading(all.length);
  const pageLabel = pages > 1 ? T.pageOf(page, pages) : '';
  const glyphs = glyphSet([
    T.site, T.sub, heading, pageLabel, T.scan, T.scanSub, T.noPhoto, SITE_URL,
    ...rows.flatMap(r => [r.typeLabel, r.title, r.priceText, r.tag, r.info]),
    '0123456789$…·/ ',
  ]);

  const target = `${SITE_URL}/s/${slug}`;
  const [regular, bold, qrSvg, photos] = await Promise.all([
    loadFont(glyphs, 400),
    loadFont(glyphs, 700),
    QRCode.toString(target, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1c1917', light: '#ffffff' } }),
    Promise.all(rows.map(r => (r.photo ? toDataUri(r.photo) : Promise.resolve(null)))),
  ]);
  if (!regular || !bold) return NextResponse.json({ error: '字体加载失败,请稍后重试' }, { status: 503 });
  const qr = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString('base64')}`;

  const height = posterHeight(rows.length);
  const img = new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: POSTER_WIDTH, height, background: '#fafaf9', fontFamily: 'Noto Sans SC' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: HEADER_HEIGHT, padding: '48px 60px 0', background: BRAND, color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 30, opacity: 0.85 }}>
            <div style={{ display: 'flex' }}>{T.site}</div>
            <div style={{ display: 'flex' }}>{pageLabel || T.sub}</div>
          </div>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, marginTop: 22 }}>{heading}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 60px', background: '#fff' }}>
          {rows.map((r, i) => <Row key={r.id} row={r} photo={photos[i] ?? null} last={i === rows.length - 1} />)}
        </div>

        <div style={{ display: 'flex', height: FOOTER_HEIGHT, padding: '0 60px', alignItems: 'center', borderTop: '2px solid #e7e5e4' }}>
          <div style={{ display: 'flex', padding: 18, background: '#fff', borderRadius: 24, border: '2px solid #e7e5e4' }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={qr} width={280} height={280} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 48, flex: 1 }}>
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, color: '#1c1917' }}>{T.scan}</div>
            <div style={{ display: 'flex', fontSize: 30, color: '#57534e', marginTop: 16 }}>{T.scanSub}</div>
            <div style={{ display: 'flex', fontSize: 26, color: BRAND, marginTop: 28, fontWeight: 700 }}>{T.site}</div>
          </div>
        </div>
      </div>
    ),
    {
      width: POSTER_WIDTH,
      height,
      fonts: [
        { name: 'Noto Sans SC', data: regular, weight: 400, style: 'normal' },
        { name: 'Noto Sans SC', data: bold, weight: 700, style: 'normal' },
      ],
      headers: {
        // 内容随摊位实时变;短缓存只为同一次查看里的重复请求(长按保存会再取一次)
        'Cache-Control': 'private, max-age=60',
        'Content-Disposition': `inline; filename="blacksburg-${slug}-${page}.png"`,
      },
    },
  );
  return img;
}
