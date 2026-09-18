// Sprint 11E:用户反馈 / 问站长 —— 输入清洗与配额(纯函数 + 可注入 db,方便单测)
//
// 入口:搜索栏对话里 LLM 判定 intent=ask_ops 时的「转给站长」卡片;以及不依赖 AI 的卡壳时刻(零结果 / 报错 / 触发配额)。
// **必须用户点发送才提交**——对话内容不自动转发(与 10C「对话不落库」一致)。

import type { NextRequest } from 'next/server';
import { prisma } from './prisma';
import { checkQuota, getVisitorId, isBotUA, type QuotaDb } from './rateLimit';
import { getClientIp } from './utils';

export const FEEDBACK_MAX_CHARS = 1000;
export const FEEDBACK_CONTACT_MAX_CHARS = 100;
export const FEEDBACK_SOURCES = ['chat', 'empty', 'error', 'limit'] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

const HOUR = 3600e3;
const DAY = 24 * HOUR;
/** 正常用户一天发不了几条;上限只为挡脚本刷表 */
export const FEEDBACK_LIMITS = { visitorPerHour: 5, visitorPerDay: 15, ipPerHour: 20 } as const;
export const FEEDBACK_LIMIT_MESSAGE = { zh: '发送太频繁了,过一会儿再试。', en: 'Too many messages. Please try again later.' };

export interface FeedbackInput { message: string; contact: string | null; source: FeedbackSource; page: string | null }

/** 清洗请求体;message 为空返回 null(调用方回 400) */
export function sanitizeFeedback(body: unknown): FeedbackInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, FEEDBACK_MAX_CHARS) : '';
  if (!message) return null;
  const contactRaw = typeof b.contact === 'string' ? b.contact.replace(/\s+/g, ' ').trim().slice(0, FEEDBACK_CONTACT_MAX_CHARS) : '';
  const source = FEEDBACK_SOURCES.includes(b.source as FeedbackSource) ? (b.source as FeedbackSource) : 'chat';
  // page 只留路径:query / hash 里可能有 focus id、utm、搜索词,不进反馈表
  let page: string | null = null;
  if (typeof b.page === 'string' && b.page.startsWith('/')) page = b.page.split(/[?#]/)[0]!.slice(0, 100);
  return { message, contact: contactRaw || null, source, page };
}

export type FeedbackGate =
  | { ok: true; visitorId: string; isNew: boolean; ip: string }
  | { ok: false; reason: 'bot' | 'limited'; retryAfterSec: number; visitorId?: string; isNew?: boolean };

export async function gateFeedback(req: NextRequest, db: QuotaDb = prisma as unknown as QuotaDb, now: () => number = Date.now): Promise<FeedbackGate> {
  if (isBotUA(req, 'full')) return { ok: false, reason: 'bot', retryAfterSec: 0 };
  const { visitorId, isNew } = getVisitorId(req);
  const ip = getClientIp(req);
  const checks = [
    { key: `feedback:vid:${visitorId}:h`, windowMs: HOUR, max: FEEDBACK_LIMITS.visitorPerHour },
    { key: `feedback:vid:${visitorId}:d`, windowMs: DAY, max: FEEDBACK_LIMITS.visitorPerDay },
    { key: `feedback:ip:${ip}:h`, windowMs: HOUR, max: FEEDBACK_LIMITS.ipPerHour },
  ];
  let retryAfterSec = 0;
  for (const c of checks) {
    const r = await checkQuota(c, db, now);
    if (!r.ok) retryAfterSec = Math.max(retryAfterSec, r.retryAfterSec);
  }
  if (retryAfterSec > 0) return { ok: false, reason: 'limited', retryAfterSec, visitorId, isNew };
  return { ok: true, visitorId, isNew, ip };
}
