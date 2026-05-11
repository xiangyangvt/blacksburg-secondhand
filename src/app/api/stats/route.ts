// GET /api/stats
// 给首页"本月已新发布 X 件 · 累计在售 Y 件"用
// 1 小时缓存 — 数字精确到分钟没意义，且能省 DB 查询

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const revalidate = 3600; // 1h

export async function GET() {
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const [thisMonthCount, totalActive] = await Promise.all([
    prisma.item.count({
      where: {
        status: 'active',
        createdAt: { gte: firstOfMonth },
      },
    }),
    prisma.item.count({ where: { status: 'active' } }),
  ]);

  return NextResponse.json(
    { thisMonthCount, totalActive },
    {
      headers: {
        // 1h 浏览器/CDN 缓存（next 的 revalidate 也是 1h）
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    }
  );
}
