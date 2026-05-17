// PATCH /api/events/[id] — 用户编辑自己发布的 event(需密码)
// DELETE /api/events/[id] — 同上,soft delete
//
// 只对 source='user' 的 event 生效;scraped events 不可改

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

// Phase 3A.1 重命名 + Phase 3B 移除 discussion(跟 POST /api/events 保持一致)
const ALLOWED_CATEGORIES = new Set(['life', 'exercise', 'academic', 'competition', 'other']);
const ALLOWED_CONTACT_TYPES = new Set(['wechat', 'phone', 'discord', 'email', 'other']);

async function loadAndAuth(id: string, code: string) {
  if (!id || !code) return { error: '缺少参数', status: 400 } as const;
  const ev = await prisma.event.findUnique({ where: { id } });
  if (!ev) return { error: 'event 不存在', status: 404 } as const;
  if (ev.source !== 'user') return { error: '只能修改自己发布的活动', status: 403 } as const;
  if (!ev.posterCodeHash) return { error: '该活动无密码,不可修改', status: 403 } as const;
  const valid = await bcrypt.compare(code, ev.posterCodeHash);
  if (!valid) return { error: '密码不正确', status: 403 } as const;
  return { ev } as const;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: '无效请求' }, { status: 400 }); }

  const code = (body.code ?? '').toString();
  const auth = await loadAndAuth(params.id, code);
  if ('error' in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  // 构造可修改字段(白名单)
  const update: any = {};
  if (typeof body.title === 'string') update.title = body.title.trim().slice(0, 50);
  if (typeof body.description === 'string') update.description = body.description.trim().slice(0, 500);
  if (typeof body.nickname === 'string') update.posterNickname = body.nickname.trim().slice(0, 20);
  if (typeof body.location === 'string') {
    const loc = body.location.trim().slice(0, 80);
    update.location = loc || null;
  }
  if (body.category && ALLOWED_CATEGORIES.has(body.category)) {
    update.category = body.category;
    if (body.category === 'other') {
      const cc = (body.customCategory ?? '').toString().trim().slice(0, 20);
      if (!cc) return NextResponse.json({ ok: false, error: '请填写「其他」类别名' }, { status: 400 });
      update.customCategory = cc;
    } else {
      update.customCategory = null;
    }
  }
  if ('startAt' in body) update.startAt = body.startAt ? new Date(body.startAt) : null;
  if ('endAt' in body) update.endAt = body.endAt ? new Date(body.endAt) : null;
  if ('contactType' in body) {
    const ct = body.contactType ? String(body.contactType) : null;
    if (ct && !ALLOWED_CONTACT_TYPES.has(ct)) {
      return NextResponse.json({ ok: false, error: '联系方式类型无效' }, { status: 400 });
    }
    update.posterContactType = ct;
  }
  if ('contact' in body) update.posterContact = body.contact ? String(body.contact).trim().slice(0, 80) : null;
  if ('contactLabel' in body) update.posterContactLabel = body.contactLabel ? String(body.contactLabel).trim().slice(0, 20) : null;
  if ('contactPublic' in body) update.posterContactPublic = Boolean(body.contactPublic);
  if ('photoUrls' in body && Array.isArray(body.photoUrls)) {
    const urls = body.photoUrls.filter((u: any) => typeof u === 'string').slice(0, 6);
    update.photoUrls = urls.length > 0 ? JSON.stringify(urls) : null;
    update.imageUrl = urls.length > 0 ? urls[0] : null;
  }
  // Phase 3B: 想找几人
  if ('maxAttendees' in body) {
    const raw = body.maxAttendees;
    if (raw === null || raw === '') {
      update.maxAttendees = null;
    } else {
      const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1 || n > 99) {
        return NextResponse.json({ ok: false, error: '想找几人需在 1-99 之间' }, { status: 400 });
      }
      update.maxAttendees = Math.floor(n);
    }
  }
  // Phase 3B: 状态切换(active / fulfilled / canceled),发起人可改;expired/hidden/deleted 不通过此 endpoint
  if ('status' in body) {
    const s = String(body.status);
    if (!['active', 'fulfilled', 'canceled'].includes(s)) {
      return NextResponse.json({ ok: false, error: '状态无效' }, { status: 400 });
    }
    update.status = s;
  }

  const updated = await prisma.event.update({
    where: { id: params.id },
    data: update,
  });

  const { posterCodeHash: _h, posterVisitorId: _v, ...safe } = updated as any;
  return NextResponse.json({ ok: true, event: safe });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // code 走 query 或 body — 这里走 body
  let body: any;
  try { body = await req.json(); }
  catch { body = {}; }
  const code = (body.code ?? '').toString();
  const auth = await loadAndAuth(params.id, code);
  if ('error' in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  await prisma.event.update({
    where: { id: params.id },
    data: { status: 'deleted' },
  });
  return NextResponse.json({ ok: true });
}
