import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock prisma 在 import 目标模块前 hoist
vi.mock('./prisma', () => ({
  prisma: {
    event: {
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from './prisma';
import { expireStaleEvents } from './eventArchive';

const updateMany = prisma.event.updateMany as ReturnType<typeof vi.fn>;

describe('expireStaleEvents', () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 3 });
    // 由于节流是模块级 lastRun,需要重置 — 没 export 重置 helper,但
    // vi.useFakeTimers 推时间前进可以绕过节流
    vi.useFakeTimers();
  });

  it('首次调用 跑 updateMany 一次', async () => {
    const n = await expireStaleEvents();
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(n).toBe(3);
  });

  it('节流:5min 内重复调用不再触发 updateMany', async () => {
    await expireStaleEvents();
    updateMany.mockClear();
    // 立刻再调
    const n = await expireStaleEvents();
    expect(updateMany).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });

  it('过 5min 后再次触发 updateMany', async () => {
    await expireStaleEvents();
    updateMany.mockClear();
    // 推 5min + 1ms
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    const n = await expireStaleEvents();
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(n).toBe(3);
  });

  it('where 条件覆盖有/无 endAt 两个分支', async () => {
    vi.advanceTimersByTime(10 * 60 * 1000); // 越过节流
    await expireStaleEvents();
    const where = updateMany.mock.calls[0][0].where;
    expect(where.status).toBe('active');
    expect(where.OR).toHaveLength(2);
    // 有 endAt:endAt < now
    expect(where.OR[0]).toMatchObject({ endAt: { not: null } });
    // 无 endAt:startAt < now - 4h
    expect(where.OR[1]).toMatchObject({ endAt: null });
  });

  it('updateMany 抛错时不冒泡(静默返 0)', async () => {
    vi.advanceTimersByTime(10 * 60 * 1000);
    updateMany.mockRejectedValueOnce(new Error('db down'));
    const n = await expireStaleEvents();
    expect(n).toBe(0); // 不抛
  });
});
