// 管理员身份验证 — 签名会话令牌(Sprint 9E)
//
// 单管理员,密码 = ADMIN_PASSWORD env var。登录成功后下发 httpOnly cookie `hb_admin`,
// 值是 HMAC-SHA256 签名的会话令牌 `base64url(payload).base64url(sig)`,payload 只有签发时间与随机 nonce。
// **cookie 里不再出现密码**(9E 之前 cookie 值就是明文 ADMIN_PASSWORD)。
//
// 签名密钥 = HMAC(keyMaterial, 当前密码):
//   - keyMaterial 优先 sha256(ADMIN_SESSION_SECRET)(生产必配,见 DEPLOY.md);
//   - 未配置时退回 scrypt(ADMIN_PASSWORD)(N=2^15,进程内只算一次)并在日志警告 ——
//     Codex 9E 互审:直接 sha256 派生会让拿到一个令牌的人离线字典爆破密码,scrypt 把每次猜测拉到 ~50ms 级,
//     但仍不如独立密钥,所以只是兜底。
//   - 混入当前密码 ⇒ 删除 / 改回默认 / 轮换密码都会让所有会话立即失效,即使配了独立密钥。
// 密码比对与签名校验都走 timingSafeEqual(先 sha256 等长再比)。
// 登录尝试限流:同 IP 10 次尝试 / 15 分钟(计所有尝试,插入先于比较,并发不可绕;成功登录也占额度,
//   10 次的上限让单管理员正常使用不会撞到)。
//
// 一次性影响:9E 上线后旧格式 cookie 校验失败,需重新登录一次。

import { cookies } from 'next/headers';
import { createHmac, createHash, randomBytes, timingSafeEqual, scryptSync } from 'crypto';
import { checkQuota, type QuotaDb } from '@/lib/rateLimit';

export const ADMIN_COOKIE = 'hb_admin';
const DEFAULT_PASS = 'changeme-in-production';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 天
export const LOGIN_WINDOW_MS = 15 * 60e3;
export const LOGIN_MAX_ATTEMPTS = 10;

export function getAdminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  if (!p || p === DEFAULT_PASS) return null; // 拒绝默认密码登录
  return p;
}

let scryptCache: { pw: string; key: Buffer } | null = null;
let warned = false;

function keyMaterial(pw: string): Buffer {
  const explicit = process.env.ADMIN_SESSION_SECRET;
  if (explicit && explicit.length >= 16) return createHash('sha256').update(explicit).digest();
  if (!warned) {
    warned = true;
    console.warn('[adminAuth] ADMIN_SESSION_SECRET 未配置,会话密钥退回 scrypt(ADMIN_PASSWORD) 派生。生产环境请配置独立密钥。');
  }
  if (scryptCache && scryptCache.pw === pw) return scryptCache.key;
  const key = scryptSync(pw, 'hb-admin-session-v1', 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  scryptCache = { pw, key };
  return key;
}

function sessionSecret(): Buffer | null {
  const pw = getAdminPassword();
  if (!pw) return null; // 密码未配 / 默认 ⇒ 不签发也不验证,无论有没有独立密钥
  return createHmac('sha256', keyMaterial(pw)).update(pw).digest();
}

const b64u = (b: Buffer) => b.toString('base64url');
const sign = (secret: Buffer, payloadB64: string) => b64u(createHmac('sha256', secret).update(payloadB64).digest());

/** 常量时间比较任意长度字符串:先各自 sha256 再 timingSafeEqual */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function issueAdminToken(now: () => number = Date.now): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const payload = b64u(Buffer.from(JSON.stringify({ iat: Math.floor(now() / 1000), n: b64u(randomBytes(12)) })));
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyAdminToken(token: string | undefined, now: () => number = Date.now): boolean {
  if (!token) return false;
  const secret = sessionSecret();
  if (!secret) return false;
  const dot = token.indexOf('.');
  if (dot <= 0 || token.indexOf('.', dot + 1) !== -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(secret, payload))) return false;
  try {
    const { iat } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { iat?: unknown };
    if (typeof iat !== 'number') return false;
    const age = Math.floor(now() / 1000) - iat;
    return age >= 0 && age <= SESSION_MAX_AGE_SEC;
  } catch {
    return false;
  }
}

export function isAdmin(): boolean {
  return verifyAdminToken(cookies().get(ADMIN_COOKIE)?.value);
}

export function setAdminCookie() {
  const token = issueAdminToken();
  if (!token) return;
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export function clearAdminCookie() {
  cookies().delete(ADMIN_COOKIE);
}

export type LoginResult = 'ok' | 'wrong' | 'limited' | 'disabled';

/**
 * 登录尝试:先记一次配额(插入先于比较,并发一批也不能超过 5 次比较),再常量时间比对。
 * 返回值给调用方决定 redirect 目标;不在这里写 cookie。
 */
export async function attemptAdminLogin(
  password: string,
  ip: string,
  db?: QuotaDb,
): Promise<LoginResult> {
  const expected = getAdminPassword();
  if (!expected) return 'disabled';
  const q = await checkQuota({ key: `adminlogin:ip:${ip}`, windowMs: LOGIN_WINDOW_MS, max: LOGIN_MAX_ATTEMPTS }, db);
  if (!q.ok) return 'limited';
  return safeEqual(password, expected) ? 'ok' : 'wrong';
}
