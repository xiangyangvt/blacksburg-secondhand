// POST /api/auth/magic-link/send
// body: { email }
//
// 流程:
// - 校验 email 格式(简单 regex)
// - 限流:同 email 在 60 秒内只发一次
// - 生成 32 字符 token,写 MagicLinkToken (15 分钟有效)
// - 用 sendEmail 发邮件
// - 总是返 { ok: true } 哪怕用户根本不存在(防 enumeration)
//   但格式错 / 限流命中 → 400 / 429

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_MS = 60 * 1000;
const TOKEN_TTL_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式有误' }, { status: 400 });
  }

  const emailRaw = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!emailRaw || !EMAIL_RE.test(emailRaw)) {
    return NextResponse.json({ error: '邮箱格式有误' }, { status: 400 });
  }

  // 限流:同 email 60 秒只能发一次
  const recent = await prisma.magicLinkToken.findFirst({
    where: { email: emailRaw },
    orderBy: { createdAt: 'desc' },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < RATE_LIMIT_MS) {
    const waitSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - recent.createdAt.getTime())) / 1000);
    return NextResponse.json(
      { error: `请稍等 ${waitSec} 秒后再试` },
      { status: 429 },
    );
  }

  const token = crypto.randomBytes(16).toString('hex'); // 32 字符
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.magicLinkToken.create({
    data: { email: emailRaw, token, expiresAt },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const link = `${siteUrl}/api/auth/magic-link/verify?token=${token}`;

  const text =
`你好,

点击下面链接登录黑堡(15 分钟内有效):
${link}

如果不是你本人操作,可忽略此邮件。

— 黑堡`;

  const html = `
<div style="font-family:-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#1c1917;max-width:480px">
  <p>你好,</p>
  <p>点击下面链接登录黑堡(15 分钟内有效):</p>
  <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px">登录黑堡</a></p>
  <p style="color:#57534e;font-size:13px">或直接复制链接到浏览器:<br><span style="word-break:break-all">${link}</span></p>
  <p style="color:#78716c;font-size:13px;margin-top:24px">如果不是你本人操作,可忽略此邮件。</p>
  <p style="color:#78716c;font-size:13px">— 黑堡</p>
</div>`;

  const result = await sendEmail({
    to: emailRaw,
    subject: '黑堡 - 登录链接',
    html,
    text,
  });

  if (!result.ok) {
    // 发送失败:返 500 而不是静默 —— 否则用户以为已发,实际没收到
    return NextResponse.json({ error: '邮件发送失败,请稍后再试' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
