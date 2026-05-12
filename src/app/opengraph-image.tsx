// 主页 OG 卡片：用 next/og 动态生成 1200x630 PNG
// 设计 V2：左侧 2×2 网格用真实最新商品照片（feed 即视感），右侧品牌文字
// 抓不到商品时回退到纯品牌卡

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Blacksburg Secondhand · 黑堡二手买卖';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// 每 30 分钟重新生成一次，让 OG 卡反映最新商品
export const revalidate = 1800;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL
  || 'https://blacksburg-secondhand-production.up.railway.app';

/**
 * Cloudinary URL 内联 transformation：在 /upload/ 后插入缩略图参数。
 * c_fill,w_400,h_400 = 裁剪填充 400×400；q_auto:eco = 最优积极压缩；f_auto = 自动 webp/avif
 * 这样 Cloudinary 直接返回小图，OG 生成时单张从 ~200KB 降到 ~30KB（80%+ 节省）。
 * 非 Cloudinary URL（本地 /uploads/、外站）原样返回。
 */
function toCloudinaryThumb(url: string, size = 400): string {
  if (typeof url !== 'string' || !url) return url;
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  if (url.includes(`c_fill,w_${size}`)) return url; // 防重复插入
  return url.replace(
    '/upload/',
    `/upload/c_fill,w_${size},h_${size},q_auto:eco,f_auto/`,
  );
}

async function getRecentPhotos(): Promise<string[]> {
  try {
    const res = await fetch(`${SITE_URL}/api/items?sort=newest`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const photos: string[] = [];
    for (const it of (data.items ?? [])) {
      if (Array.isArray(it.photoUrls) && it.photoUrls.length > 0) {
        // 每条商品取封面 + 转成 400x400 缩略图
        photos.push(toCloudinaryThumb(it.photoUrls[0], 400));
      }
      if (photos.length >= 4) break;
    }
    return photos;
  } catch {
    return [];
  }
}

export default async function MainOg() {
  const photos = await getRecentPhotos();
  const hasFeed = photos.length >= 4;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#FAFAF9', // stone-50
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* 左侧：2×2 商品照片网格（或回退） */}
        {hasFeed ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: '1fr 1fr',
              width: 660,
              height: '100%',
              gap: 4,
              background: '#fff',
            }}
          >
            {photos.slice(0, 4).map((url, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  width: '100%',
                  height: '100%',
                  overflow: 'hidden',
                  background: '#E7E5E4',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  width={328}
                  height={313}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  alt=""
                />
              </div>
            ))}
          </div>
        ) : (
          // 回退：品牌色块（无商品时）
          <div
            style={{
              width: 660,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #7B1113 0%, #5a0c0e 100%)',
              color: 'white',
              fontSize: 88,
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            BBSH
          </div>
        )}

        {/* 右侧：品牌信息 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '64px 56px',
            background: '#FAFAF9',
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: '#1C1917', // stone-900
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              marginBottom: 12,
            }}
          >
            黑堡<span style={{ color: '#7B1113' }}>二手</span>
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: '#44403C', // stone-700
              letterSpacing: '-0.01em',
              marginBottom: 28,
            }}
          >
            Blacksburg Secondhand
          </div>
          <div
            style={{
              fontSize: 26,
              color: '#57534E', // stone-600
              lineHeight: 1.4,
              marginBottom: 32,
            }}
          >
            黑堡本地华人 / 学生
            <br />
            免登录二手交易
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#A8A29E', // stone-400
            }}
          >
            blacksburg-secondhand.up.railway.app
          </div>
        </div>
      </div>
    ),
    size,
  );
}
