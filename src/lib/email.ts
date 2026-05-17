// 邮件发送抽象 —— 包一层 Resend SDK
//
// 行为:
// - dev (NODE_ENV !== 'production') 且没配 RESEND_API_KEY → console.log 邮件内容并 return ok
//   * 这是关键调试 affordance:本地能直接从 console 拷 magic-link URL 到浏览器验证
// - prod 缺 key → return { ok: false, error: 'email service not configured' }
// - 否则正常 send,失败 catch 后返 { ok: false, error: ... }

import { Resend } from 'resend';

type SendEmailOpts = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type SendEmailResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(opts: SendEmailOpts): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';
  const isProd = process.env.NODE_ENV === 'production';

  if (!apiKey) {
    if (!isProd) {
      // dev fallback —— 关键调试 affordance:console 输出邮件正文,Sean 本地能直接拷 URL 验证
      // eslint-disable-next-line no-console
      console.log('[email:dev] ────────────────────────────────────────');
      // eslint-disable-next-line no-console
      console.log(`[email:dev] To:      ${opts.to}`);
      // eslint-disable-next-line no-console
      console.log(`[email:dev] Subject: ${opts.subject}`);
      // eslint-disable-next-line no-console
      console.log(`[email:dev] Text:`);
      // eslint-disable-next-line no-console
      console.log(opts.text);
      // eslint-disable-next-line no-console
      console.log('[email:dev] ────────────────────────────────────────');
      return { ok: true };
    }
    return { ok: false, error: 'email service not configured' };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) {
      return { ok: false, error: error.message || 'send failed' };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return { ok: false, error: msg };
  }
}
