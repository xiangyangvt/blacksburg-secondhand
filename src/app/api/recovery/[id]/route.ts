// admin 端处理找回申请的 PATCH
// 仅 admin 调用

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/adminAuth';

const VALID_STATUS = ['pending', 'contacted', 'resolved', 'rejected', 'abuse'];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { id } = params;
  const existing = await prisma.recoveryRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const updates: Record<string, any> = {};

  if (typeof body.status === 'string') {
    if (!VALID_STATUS.includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (typeof body.adminNotes === 'string') {
    updates.adminNotes = body.adminNotes;
  }
  if (typeof body.resolvedEditCode === 'string') {
    updates.resolvedEditCode = body.resolvedEditCode;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no updates' }, { status: 400 });
  }

  const updated = await prisma.recoveryRequest.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({ ok: true, item: updated });
}
