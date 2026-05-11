// 主页 OG 卡片：用 next/og 动态生成 1200x630 PNG
// 故意只用拉丁字符 + emoji（不依赖中文字体下载，最稳）
// 微信预览卡片不一定渲染 og:image，但提供它是最佳实践

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Blacksburg Secondhand · 黑堡二手买卖';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function MainOg() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #7B1113 0%, #5a0c0e 100%)',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: 80,
        }}
      >
        <div style={{ fontSize: 96, marginBottom: 24 }}>🏠</div>
        <div
          style={{
            fontSize: 88,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            textAlign: 'center',
            lineHeight: 1.1,
          }}
        >
          Blacksburg Secondhand
        </div>
        <div
          style={{
            fontSize: 36,
            marginTop: 32,
            opacity: 0.92,
            textAlign: 'center',
          }}
        >
          Local marketplace · Virginia Tech area
        </div>
        <div
          style={{
            fontSize: 24,
            marginTop: 60,
            padding: '12px 28px',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 999,
          }}
        >
          No accounts · Open source · MIT
        </div>
      </div>
    ),
    size,
  );
}
