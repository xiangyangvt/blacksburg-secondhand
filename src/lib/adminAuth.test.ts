import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { issueAdminToken, verifyAdminToken, safeEqual, attemptAdminLogin, LOGIN_MAX_ATTEMPTS } from './adminAuth';
import { getClientIpFromHeaders } from './utils';
import type { QuotaDb } from './rateLimit';

function memDb(): QuotaDb {
  type Row = { id: string; key: string; tag: string | null; bucket: number | null; admitted: boolean; createdAt: Date };
  const rows: Row[] = []; let seq = 0;
  const inWin = (w: { key: string; createdAt: { gt: Date }; tag?: string }) =>
    rows.filter(r => r.key === w.key && r.createdAt > w.createdAt.gt && (w.tag === undefined || r.tag === w.tag));
  return { rateLimitHit: {
    async count({ where }) { return inWin(where).length; },
    async findFirst({ where }) { const h = inWin(where)[0]; return h ? { id: h.id, admitted: h.admitted, createdAt: h.createdAt } : null; },
    async findMany({ where, skip, take }) { return inWin(where).slice(skip, skip + take).map(r => ({ createdAt: r.createdAt })); },
    async create({ data }) { const row = { id: `r${++seq}`, ...data, admitted: false, createdAt: new Date() }; rows.push(row); return { id: row.id }; },
    async update({ where, data }) { const r = rows.find(r => r.id === where.id); if (r) r.admitted = data.admitted; },
    async deleteMany() {},
  } };
}

const PW = 'correct-horse-battery';
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = { ADMIN_PASSWORD: process.env.ADMIN_PASSWORD, ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET };
  process.env.ADMIN_PASSWORD = PW;
  delete process.env.ADMIN_SESSION_SECRET;
});
afterEach(() => {
  for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe('admin session token', () => {
  it('签发的令牌可验证,且不含密码', () => {
    const t = issueAdminToken();
    expect(t).toBeTruthy();
    expect(verifyAdminToken(t!)).toBe(true);
    expect(t!.includes(PW)).toBe(false);
    expect(Buffer.from(t!.split('.')[0], 'base64url').toString()).not.toContain(PW);
  });

  it('篡改任一字符即失效;旧格式(明文密码)失效', () => {
    const t = issueAdminToken()!;
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'a' ? 'b' : 'a') + s.slice(i + 1);
    expect(verifyAdminToken(flip(t, 3))).toBe(false);          // payload
    expect(verifyAdminToken(flip(t, t.length - 2))).toBe(false); // 签名
    expect(verifyAdminToken(PW)).toBe(false);                   // 9E 前的 cookie 值
    expect(verifyAdminToken('')).toBe(false);
    expect(verifyAdminToken('a.b.c')).toBe(false);
  });

  it('30 天后过期;未来签发的不认', () => {
    const t0 = 1_700_000_000_000;
    const t = issueAdminToken(() => t0)!;
    expect(verifyAdminToken(t, () => t0 + 29 * 86400e3)).toBe(true);
    expect(verifyAdminToken(t, () => t0 + 31 * 86400e3)).toBe(false);
    expect(verifyAdminToken(t, () => t0 - 1000)).toBe(false);
  });

  it('换密码 / 删密码 / 改回默认 ⇒ 全部会话失效,配了独立密钥也一样(Codex 9E 互审)', () => {
    const t = issueAdminToken()!;
    process.env.ADMIN_PASSWORD = 'another-password-1';
    expect(verifyAdminToken(t)).toBe(false);
    process.env.ADMIN_SESSION_SECRET = 'a-long-independent-secret';
    process.env.ADMIN_PASSWORD = PW;
    const t2 = issueAdminToken()!;
    expect(verifyAdminToken(t2)).toBe(true);
    process.env.ADMIN_PASSWORD = 'another-password-2';
    expect(verifyAdminToken(t2)).toBe(false);
    process.env.ADMIN_PASSWORD = 'changeme-in-production';
    expect(verifyAdminToken(t2)).toBe(false);
    delete process.env.ADMIN_PASSWORD;
    expect(verifyAdminToken(t2)).toBe(false);
  });

  it('独立密钥与密码派生的令牌互不相认', () => {
    const tDerived = issueAdminToken()!;
    process.env.ADMIN_SESSION_SECRET = 'a-long-independent-secret';
    expect(verifyAdminToken(tDerived)).toBe(false);
    const tExplicit = issueAdminToken()!;
    delete process.env.ADMIN_SESSION_SECRET;
    expect(verifyAdminToken(tExplicit)).toBe(false);
  });

  it('默认密码或未配置时不签发、不验证', () => {
    process.env.ADMIN_PASSWORD = 'changeme-in-production';
    expect(issueAdminToken()).toBeNull();
    expect(verifyAdminToken('x.y')).toBe(false);
  });
});

describe('safeEqual', () => {
  it('长度不同也能比,不抛', () => {
    expect(safeEqual('a', 'abc')).toBe(false);
    expect(safeEqual('same', 'same')).toBe(true);
  });
});

describe('attemptAdminLogin', () => {
  it('正确密码 ok,错误 wrong,第 11 次尝试 limited(无论对错)', async () => {
    const db = memDb();
    expect(await attemptAdminLogin('nope', '1.1.1.1', db)).toBe('wrong');
    for (let i = 1; i < LOGIN_MAX_ATTEMPTS; i++) expect(await attemptAdminLogin('nope', '1.1.1.1', db)).toBe('wrong');
    expect(await attemptAdminLogin(PW, '1.1.1.1', db)).toBe('limited'); // 第 11 次即便正确也拒
    expect(await attemptAdminLogin(PW, '2.2.2.2', db)).toBe('ok');       // 换 IP 正常
  });

  it('未配置密码 → disabled', async () => {
    process.env.ADMIN_PASSWORD = 'changeme-in-production';
    expect(await attemptAdminLogin('x', '1.1.1.1', memDb())).toBe('disabled');
  });
});

describe('getClientIpFromHeaders(Codex 9E 互审:XFF 取可信代理追加的最后一段)', () => {
  it('客户端伪造的首段不被采信', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' });
    expect(getClientIpFromHeaders(h)).toBe('203.0.113.9');
  });
  it('单段 / 无头 / x-real-ip 回退', () => {
    expect(getClientIpFromHeaders(new Headers({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(getClientIpFromHeaders(new Headers({ 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1');
    expect(getClientIpFromHeaders(new Headers())).toBe('unknown');
  });
  it('多段一律取最后一段(不提供跳数配置)', () => {
    expect(getClientIpFromHeaders(new Headers({ 'x-forwarded-for': 'a, b, c' }))).toBe('c');
  });
});
