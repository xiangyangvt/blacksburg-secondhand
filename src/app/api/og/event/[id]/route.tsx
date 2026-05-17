// GET /api/og/event/[id] — Dynamic OG card for events (1200x630)
//
// 跑在 edge runtime 以保证 @vercel/og 的 ImageResponse 渲染速度。
// edge 不支持 Prisma,所以经 helper route /api/events/[id]/og-data 拿数据。
//
// 中文字体:edge runtime 默认字体不支持 CJK。方案:从 Google Fonts CSS 拿
// Noto Sans SC 子集 woff2 文件,运行时 fetch arrayBuffer 后挂到 ImageResponse.fonts。
// 拿不到字体的兜底:走 SVG 默认 fallback(可能 tofu 显示),但不让整个图崩。

import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

export const runtime = 'edge';

const WIDTH = 1200;
const HEIGHT = 630;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://blacksburg-secondhand-production.up.railway.app';

// 类目 label(跟 EventCard 保持一致)
const CATEGORY_LABEL: Record<string, string> = {
  life: '生活',
  exercise: '运动',
  academic: '学术',
  competition: '比赛',
  discussion: '讨论',
  other: '其他',
  events: '生活',
  sports: '比赛',
  news: '讨论',
};

// 状态 badge
const STATUS_BADGE: Record<
  string,
  { label: string; bg: string; fg: string; border: string } | null
> = {
  active: null,
  fulfilled: {
    label: '已结清',
    bg: '#ecfdf5',
    fg: '#065f46',
    border: '#a7f3d0',
  },
  canceled: {
    label: '已取消',
    bg: '#fff1f2',
    fg: '#9f1239',
    border: '#fecdd3',
  },
  expired: {
    label: '已过期',
    bg: '#f5f5f4',
    fg: '#78716c',
    border: '#e7e5e4',
  },
};

/** 格式化时间:"5月20日 周三 19:00" */
function formatStartTime(startAtIso: string | null): string {
  if (!startAtIso) return '长期';
  const d = new Date(startAtIso);
  if (isNaN(d.getTime())) return '长期';
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const wd = weekdays[d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${wd} ${hh}:${mm}`;
}

/**
 * 短期倒计时(跟 EventCard.getCountdown 同逻辑):
 *   - startAt 已过 + endAt 未过 → "进行中"
 *   - < 1 小时 → "还有 X 分钟"
 *   - 1h - 24h → "还有 X 小时"
 *   - > 24h → null(formatStartTime 已经说"X月X日"了,不重复)
 */
function getCountdown(
  startAtIso: string | null,
  endAtIso: string | null,
): string | null {
  if (!startAtIso) return null;
  const s = new Date(startAtIso);
  if (isNaN(s.getTime())) return null;
  const now = Date.now();
  const diffMs = s.getTime() - now;

  if (diffMs <= 0) {
    if (endAtIso) {
      const e = new Date(endAtIso);
      if (!isNaN(e.getTime()) && e.getTime() > now) return '进行中';
    }
    return null;
  }
  if (diffMs < 3600e3) {
    const m = Math.max(1, Math.ceil(diffMs / 60000));
    return `还有 ${m} 分钟`;
  }
  if (diffMs < 24 * 3600e3) {
    const h = Math.ceil(diffMs / 3600e3);
    return `还有 ${h} 小时`;
  }
  return null;
}

/** 响应数文案 */
function formatResponse(
  status: string | null | undefined,
  maxAttendees: number | null | undefined,
  responseCount: number,
): string {
  if (status && status !== 'active') return ''; // 非 active 状态由 badge 处理
  if (maxAttendees && maxAttendees > 0) {
    return `想找 ${maxAttendees} · 已 ${responseCount} 响应`;
  }
  if (responseCount > 0) {
    return `已 ${responseCount} 响应`;
  }
  return '等你来响应';
}

/** 拿 Noto Sans SC 字体 binary(边缘缓存)。失败 → 返 null。 */
async function loadCJKFont(): Promise<ArrayBuffer | null> {
  try {
    // 走 Google Fonts CSS API 拿 woff2 URL — UA 头决定返回 woff2 还是 ttf
    const cssRes = await fetch(
      'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@600&display=swap',
      {
        headers: {
          // 假装 Chrome 桌面,Google 才会返 woff2
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
    );
    if (!cssRes.ok) return null;
    const cssText = await cssRes.text();
    // 从 css 里抽 woff2 URL
    const match = cssText.match(/src:\s*url\((https:\/\/[^)]+\.woff2)\)/);
    if (!match) return null;
    const fontUrl = match[1];
    const fontRes = await fetch(fontUrl);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

/** Fallback 占位图(纯品牌色 + 文字),数据缺失 / 渲染异常时返这个 */
function fallbackImage(text: string, fontData: ArrayBuffer | null) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          fontFamily: fontData ? 'Noto Sans SC' : 'sans-serif',
        }}
      >
        <div style={{ fontSize: 96, color: '#7B1113', fontWeight: 700 }}>
          黑堡
        </div>
        <div style={{ fontSize: 36, color: '#78716c', marginTop: 24 }}>
          {text}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: fontData
        ? [
            {
              name: 'Noto Sans SC',
              data: fontData,
              style: 'normal',
              weight: 600,
            },
          ]
        : undefined,
    },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  // 先尝试加载字体 — 即使 event 没找到也用,占位图也得显中文
  const fontData = await loadCJKFont();

  let event: {
    title: string;
    category: string | null;
    customCategory: string | null;
    startAt: string | null;
    endAt: string | null;
    status: string | null;
    maxAttendees: number | null;
    responseCount: number;
  } | null = null;

  try {
    const dataRes = await fetch(
      `${SITE_URL}/api/events/${params.id}/og-data`,
      { cache: 'no-store' },
    );
    if (dataRes.ok) {
      const json = await dataRes.json();
      if (json.ok && json.event) {
        event = {
          title: json.event.title ?? '',
          category: json.event.category ?? null,
          customCategory: json.event.customCategory ?? null,
          startAt: json.event.startAt ?? null,
          endAt: json.event.endAt ?? null,
          status: json.event.status ?? null,
          maxAttendees: json.event.maxAttendees ?? null,
          responseCount: json.event.responseCount ?? 0,
        };
      }
    }
  } catch {
    // 数据 fetch 失败 → 走兜底
  }

  if (!event) {
    return fallbackImage('活动不存在或已下线', fontData);
  }

  // === 渲染主图 ===
  try {
    const cat = event.category ?? 'life';
    const catLabel =
      cat === 'other' && event.customCategory
        ? event.customCategory
        : CATEGORY_LABEL[cat] ?? '活动';
    const timeText = formatStartTime(event.startAt);
    const countdown = getCountdown(event.startAt, event.endAt);
    const responseText = formatResponse(
      event.status,
      event.maxAttendees,
      event.responseCount,
    );
    const badge =
      event.status && STATUS_BADGE[event.status]
        ? STATUS_BADGE[event.status]
        : null;

    // 标题截断 — 40 字以上加 …(@vercel/og 不支持 line-clamp,自己控字数)
    const titleRaw = event.title || '未命名活动';
    const title =
      titleRaw.length > 40 ? `${titleRaw.slice(0, 40)}…` : titleRaw;

    const fontFamily = fontData ? 'Noto Sans SC' : 'sans-serif';

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            padding: '56px 72px',
            fontFamily,
            position: 'relative',
          }}
        >
          {/* 顶部 brand + status badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: '#7B1113',
                  letterSpacing: -1,
                  display: 'flex',
                }}
              >
                黑堡
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 16px',
                  borderRadius: 999,
                  background: '#f5f5f4',
                  color: '#57534e',
                  fontSize: 24,
                  fontWeight: 600,
                }}
              >
                {catLabel}
              </div>
            </div>
            {badge && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 24px',
                  borderRadius: 999,
                  background: badge.bg,
                  color: badge.fg,
                  border: `2px solid ${badge.border}`,
                  fontSize: 28,
                  fontWeight: 600,
                }}
              >
                {badge.label}
              </div>
            )}
          </div>

          {/* 中央标题 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              marginTop: 24,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                fontSize: 68,
                fontWeight: 700,
                color: '#1c1917',
                lineHeight: 1.2,
                letterSpacing: -1,
                display: 'flex',
              }}
            >
              {title}
            </div>
          </div>

          {/* 底部:时间(左) + 响应数(右) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              borderTop: '2px solid #e7e5e4',
              paddingTop: 28,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 600,
                  color: '#44403c',
                  display: 'flex',
                }}
              >
                {timeText}
              </div>
              {countdown && (
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 600,
                    color: '#7B1113',
                    display: 'flex',
                  }}
                >
                  · {countdown}
                </div>
              )}
            </div>
            {responseText && (
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 600,
                  color: '#7B1113',
                  display: 'flex',
                }}
              >
                {responseText}
              </div>
            )}
          </div>
        </div>
      ),
      {
        width: WIDTH,
        height: HEIGHT,
        fonts: fontData
          ? [
              {
                name: 'Noto Sans SC',
                data: fontData,
                style: 'normal',
                weight: 600,
              },
            ]
          : undefined,
        headers: {
          'cache-control': 'public, max-age=60',
        },
      },
    );
  } catch {
    // 任何渲染失败 → fallback,不让详情页 metadata 拖垮
    return fallbackImage('活动卡片生成失败', fontData);
  }
}
