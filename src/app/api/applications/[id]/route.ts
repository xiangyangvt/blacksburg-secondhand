// PATCH /api/applications/[id]
//   模式 1: A 同意/婉拒 → body { listingEditCode, action: 'approve'|'reject', rejectReason? }
//   模式 2: B 撤回（仅 pending） → body { applicantEditCode, action: 'cancel' }
//
// DELETE /api/applications/[id]?listingEditCode=...
//   A 清理一条申请记录（无论状态）

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const application = await prisma.application.findUnique({
    where: { id },
    include: { listing: true },
  });
  if (!application) return err('申请不存在', 404);

  const { action } = body;

  // === 模式 1: A 同意/婉拒（用 listing 的 editCode） ===
  if (action === 'approve' || action === 'reject') {
    const code = body.listingEditCode;
    if (typeof code !== 'string') return err('请提供 listing 密码');
    if (application.status !== 'pending') return err(`当前状态 (${application.status}) 不能改`);

    const ok = await bcrypt.compare(code, application.listing.editCodeHash);
    if (!ok) return err('密码错误', 401);

    if (action === 'approve') {
      await prisma.application.update({
        where: { id },
        data: { status: 'approved' },
      });
      return NextResponse.json({ success: true, status: 'approved' });
    } else {
      const reason = typeof body.rejectReason === 'string' ? body.rejectReason.slice(0, 500) : null;
      await prisma.application.update({
        where: { id },
        data: { status: 'rejected', rejectReason: reason },
      });
      return NextResponse.json({ success: true, status: 'rejected' });
    }
  }

  // === 模式 2: B 撤回（仅 pending；用申请人自己的 editCode） ===
  if (action === 'cancel') {
    const code = body.applicantEditCode;
    if (typeof code !== 'string') return err('请提供你自己的密码');
    if (application.status !== 'pending') return err('仅 pending 状态可撤回');

    const ok = await bcrypt.compare(code, application.editCodeHash);
    if (!ok) return err('密码错误', 401);

    await prisma.application.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    return NextResponse.json({ success: true, status: 'cancelled' });
  }

  return err('action 必须是 approve / reject / cancel');
}

// DELETE：A 清理 application 记录（任何状态都能删）
// 用法：?listingEditCode=xxx
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const code = req.nextUrl.searchParams.get('listingEditCode') ?? '';
  if (!code) return err('请提供 listing 密码');

  const application = await prisma.application.findUnique({
    where: { id },
    include: { listing: true },
  });
  if (!application) return err('申请不存在', 404);

  const ok = await bcrypt.compare(code, application.listing.editCodeHash);
  if (!ok) return err('密码错误', 401);

  await prisma.application.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
