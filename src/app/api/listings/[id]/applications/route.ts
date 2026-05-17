// POST /api/listings/[id]/applications
// B 给某个 listing 发申请联系；用自己的密码 + 可选附上自己的 listing

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  getClientIp,
  CONTACT_TYPES,
  LISTING_GENDERS,
} from '@/lib/utils';

const VALID_CONTACT_TYPES = CONTACT_TYPES.map(c => c.id);
const VALID_GENDERS = LISTING_GENDERS as readonly string[];

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const {
    applicantGender,
    ageRange,
    contactType,
    contactValue,
    customContactLabel,
    message,
    editCode,
    attachedListingId,
    utmSource,
  } = body;

  // 字段校验
  if (!VALID_GENDERS.includes(applicantGender)) return err('性别不合法');
  if (!VALID_CONTACT_TYPES.includes(contactType)) return err('联系方式类型不合法');
  if (typeof contactValue !== 'string' || !contactValue.trim()) return err('联系方式不能为空');
  if (typeof message !== 'string' || !message.trim()) return err('消息不能为空');
  if (message.length > 500) return err('消息最多 500 字');
  if (typeof editCode !== 'string' || editCode.length < 6) return err('密码至少 6 位');

  // listing 必须存在且活跃
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.status !== 'active') return err('listing 不存在或已下架', 404);

  // 软劝退：listing 不接受这个性别就拒
  // 'F-only' 不接受 M / nb，'M-only' 不接受 F / nb，'any' 都接受
  // 后端仍校验，前端只是 disabled
  if (listing.lookingForGender === 'F-only' && applicantGender !== 'F') {
    return err('对方仅接受同性申请（F-only）');
  }
  if (listing.lookingForGender === 'M-only' && applicantGender !== 'M') {
    return err('对方仅接受同性申请（M-only）');
  }

  // 不允许重复申请同一 listing
  const trimmedContact = contactValue.trim();
  const existing = await prisma.application.findFirst({
    where: {
      listingId: id,
      contactValue: trimmedContact,
      status: { in: ['pending', 'approved', 'rejected'] },
    },
  });
  if (existing) {
    return NextResponse.json({
      error: existing.status === 'rejected' ? '对方已婉拒，无法重新申请' : '你已申请过这个 listing',
      existingStatus: existing.status,
      existingId: existing.id,
    }, { status: 409 });
  }

  // 限速：同 IP 1h 内最多 5 条 application
  const ip = getClientIp(req);
  const recentCount = await prisma.application.count({
    where: { ipAddress: ip, createdAt: { gte: new Date(Date.now() - 3600e3) } },
  });
  if (recentCount >= 5) return err('申请太频繁，请稍后再试', 429);

  // 附上 B 自己的 listing（可选）：仅当属实存在 + 同 contact + active 时才接受
  let validAttachedId: string | null = null;
  if (typeof attachedListingId === 'string' && attachedListingId) {
    const att = await prisma.listing.findUnique({ where: { id: attachedListingId } });
    if (att && att.status === 'active' && att.contactValue === trimmedContact) {
      validAttachedId = att.id;
    }
  }

  const editCodeHash = await bcrypt.hash(editCode, 10);
  const cleanedUtm = typeof utmSource === 'string' && utmSource ? utmSource.slice(0, 64) : null;

  const application = await prisma.application.create({
    data: {
      listingId: id,
      applicantGender,
      ageRange: ageRange || null,
      contactType,
      contactValue: trimmedContact,
      customContactLabel: customContactLabel?.trim() || null,
      message: message.trim(),
      editCodeHash,
      attachedListingId: validAttachedId,
      status: 'pending',
      ipAddress: ip,
      utmSource: cleanedUtm,
    },
  });

  // 申请也算 listing 活跃，bump
  await prisma.listing.update({
    where: { id },
    data: { bumpedAt: new Date() },
  });

  return NextResponse.json({ id: application.id, success: true });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
