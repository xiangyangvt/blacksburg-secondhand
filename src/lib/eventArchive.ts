// Sprint 7 Phase 3B §4.6: lazy 归档过期 events
//
// 调用时机:每次 GET /api/events 入口先 await 一次。读多写少的场景下
// 用 updateMany 一次性把过期 events 改成 status='expired',然后 list query
// 自然过滤掉(LiveSection 也自动不显)。
//
// 时间策略(比 spec 字面更宽容):
//   - 有 endAt: 过 endAt 才 expired
//   - 无 endAt: 过 startAt 4 小时 buffer 后才 expired
//     (麻将局过点开始 / 还在进行,4h 后才算结束)
//
// 节流:进程内 in-memory lastRun,5 分钟内重复 read 只触发一次 update
// 避免高频列表请求频繁 hit DB write(单实例 Railway,memory state 够用)

import { prisma } from './prisma';

const RUN_INTERVAL_MS = 5 * 60 * 1000;
const NO_END_BUFFER_MS = 4 * 60 * 60 * 1000;

let lastRun = 0;

export async function expireStaleEvents(): Promise<number> {
  const now = Date.now();
  if (now - lastRun < RUN_INTERVAL_MS) return 0;
  lastRun = now;

  const nowDate = new Date(now);
  const startBuffer = new Date(now - NO_END_BUFFER_MS);

  try {
    const result = await prisma.event.updateMany({
      where: {
        status: 'active',
        OR: [
          { endAt: { not: null, lt: nowDate } },
          { endAt: null, startAt: { not: null, lt: startBuffer } },
        ],
      },
      data: { status: 'expired' },
    });
    return result.count;
  } catch {
    // 失败不影响主流程(读列表仍可)— 静默
    return 0;
  }
}
