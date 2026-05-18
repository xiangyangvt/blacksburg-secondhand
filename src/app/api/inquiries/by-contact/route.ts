// POST /api/inquiries/by-contact — Phase 3C "我发送的询价" tab 用
//
// 用 contactValue 查这个联系方式发出去的所有 inquiry(buyer 视角),关联 item
// 不需要 editCode 验证(buyer 发 inquiry 时没设 code);contactValue 本身就是身份凭证
// 同 contactValue 的用户都能看自己发的(这是接受的弱保护 — 跟 reveal contact 同款)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const value = typeof body.value === 'string' ? body.value.trim() : '';
  if (!value) {
    return NextResponse.json({ error: 'value 必填' }, { status: 400 });
  }

  // 二手 inquiry 才查(itemId 非空);排除已隐藏 / 删除的
  // contactValue 大小写敏感存(用户当时怎么填的),查时也大小写敏感 — 跟 reply / delete 逻辑一致
  const inquiries = await prisma.inquiry.findMany({
    where: {
      contactValue: value,
      itemId: { not: null },
      status: 'active',
    },
    include: {
      item: {
        select: {
          id: true, title: true, price: true, type: true, category: true,
          customTag: true, photoUrls: true, status: true, createdAt: true,
          contactType: true, customContactLabel: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const items = inquiries.map((inq) => ({
    id: inq.id,
    message: inq.message,
    sellerReply: inq.sellerReply,
    sellerRepliedAt: inq.sellerRepliedAt ? inq.sellerRepliedAt.toISOString() : null,
    createdAt: inq.createdAt.toISOString(),
    status: inq.status,
    contactType: inq.contactType,
    customContactLabel: inq.customContactLabel,
    item: inq.item
      ? {
          id: inq.item.id,
          title: inq.item.title,
          price: inq.item.price,
          type: inq.item.type,
          category: inq.item.category,
          customTag: inq.item.customTag,
          // Item.photoUrls 是 JSON 字符串,parse 成数组给前端用
          photoUrls: (() => {
            try {
              const arr = JSON.parse(inq.item.photoUrls);
              return Array.isArray(arr) ? arr : [];
            } catch { return []; }
          })(),
          status: inq.item.status,
          createdAt: inq.item.createdAt.toISOString(),
        }
      : null,
  }));

  return NextResponse.json({ ok: true, items });
}
