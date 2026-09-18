// Sprint 11A:POST /api/shelf   body { value, editCode }  →  { slug, path, count }
//
// 取或建这位卖家的摊位(长图二维码的落点)。身份 = 「联系方式 + 编辑码」,与「我的」(POST /api/items/by-contact)同一套:
// 该联系方式下至少有一件 active 物品的编辑码匹配才放行。只知道联系方式建不了别人的摊位。
// 配额:同 visitor / 同 IP 各 20 次 / 小时(每次要跑 bcrypt,也防编辑码爆破)。bot UA 403。

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkQuota, getVisitorId, isBotUA, setVisitorCookie } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/utils';
import { getOrCreateShelf } from '@/lib/shelf';

export const dynamic = 'force-dynamic';

const HOUR = 3600e3;
const MAX_PER_HOUR = 20;

export async function POST(req: NextRequest) {
  if (isBotUA(req, 'full')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const value = typeof body?.value === 'string' ? body.value.trim() : '';
  const editCode = typeof body?.editCode === 'string' ? body.editCode : '';
  if (!value) return NextResponse.json({ error: 'value 不能为空' }, { status: 400 });
  if (editCode.length < 6) return NextResponse.json({ error: '请输入密码（≥6 位）' }, { status: 401 });

  const { visitorId, isNew } = getVisitorId(req);
  const withCookie = (res: NextResponse) => { if (isNew) setVisitorCookie(res, visitorId); return res; };
  let retryAfterSec = 0;
  for (const key of [`shelf:vid:${visitorId}:h`, `shelf:ip:${getClientIp(req)}:h`]) {
    const r = await checkQuota({ key, windowMs: HOUR, max: MAX_PER_HOUR });
    if (!r.ok) retryAfterSec = Math.max(retryAfterSec, r.retryAfterSec);
  }
  if (retryAfterSec > 0) {
    return withCookie(NextResponse.json({ error: '操作太频繁了,过一会儿再试。' }, { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }));
  }

  const actives = await prisma.item.findMany({
    where: { contactValue: value, status: 'active', NOT: { category: 'housing' } },
    select: { editCodeHash: true },
    take: 200,
  });
  const matches = await Promise.all(actives.map(it => bcrypt.compare(editCode, it.editCodeHash)));
  const count = matches.filter(Boolean).length;
  if (count === 0) return withCookie(NextResponse.json({ error: '没有找到用这个密码发布的在售物品' }, { status: 404 }));

  const slug = await getOrCreateShelf(value, prisma);
  return withCookie(NextResponse.json({ slug, path: `/s/${slug}`, count }));
}
