// GET /api/admin/digest?notify=1&reports=1&hidden=0&scraperFails=3&backupDays=8&rejects=50
//
// 维护摘要(Sprint 9D)。鉴权二选一:管理员会话 cookie,或 `Authorization: Bearer <DIGEST_SECRET>`(给 GitHub Actions cron)。
// 返回结构化摘要 + 越过阈值的告警(形状对齐注意力账本的 needs-you:kind / ref / task / note)。
// notify=1 且有告警 → 通过 Resend 发一封一屏邮件到 DIGEST_EMAIL_TO;正常日不发。
// 阈值可由调用方(workflow env)传入,0 = 关闭该项;缺省见 lib/digest.ts DEFAULT_THRESHOLDS。

import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isAdmin } from '@/lib/adminAuth';
import { sendEmail } from '@/lib/email';
import { computeDigest, evaluateThresholds, parseThresholds, renderDigestEmail } from '@/lib/digest';

export const dynamic = 'force-dynamic';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://blacksburg-secondhand-production.up.railway.app').replace(/\/$/, '');

// 常量时间比较(与 9E 的 adminAuth.safeEqual 同款;9E 合并后可改为复用)
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

function bearerOk(req: NextRequest): boolean {
  const secret = process.env.DIGEST_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || secret.length < 16 || !auth.startsWith('Bearer ')) return false;
  return safeEqual(auth.slice(7), secret);
}

export async function GET(req: NextRequest) {
  if (!bearerOk(req) && !isAdmin()) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const thresholds = parseThresholds(sp);
  const digest = await computeDigest();
  const alerts = evaluateThresholds(digest, thresholds, SITE_URL);

  let sent: boolean | null = null;
  let sendError: string | null = null;
  if (sp.get('notify') === '1' && alerts.length > 0) {
    const to = process.env.DIGEST_EMAIL_TO;
    if (!to) {
      sendError = 'DIGEST_EMAIL_TO 未配置';
    } else {
      const mail = renderDigestEmail(digest, alerts, SITE_URL);
      const r = await sendEmail({ to, ...mail });
      sent = r.ok;
      if (!r.ok) sendError = r.error;
    }
  }
  return NextResponse.json({ digest, thresholds, alerts, sent, sendError });
}
