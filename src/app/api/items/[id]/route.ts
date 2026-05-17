import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  CATEGORIES,
  CONTACT_TYPES,
  serializePhotoUrls,
  parsePhotoUrls,
} from '@/lib/utils';
import { schedulePendingCloudinaryDeletion } from '@/lib/uploader';

const VALID_CATEGORIES = CATEGORIES.map(c => c.id);
const VALID_CONTACT_TYPES = CONTACT_TYPES.map(c => c.id);

// PATCH /api/items/[id]  编辑（需要密码）
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { editCode, ...updates } = body;
  if (typeof editCode !== 'string') return err('请提供密码');

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item || item.status !== 'active') return err('商品不存在', 404);

  const ok = await bcrypt.compare(editCode, item.editCodeHash);
  if (!ok) return err('密码错误', 401);

  // 允许更新的字段
  const data: any = {};
  if (updates.title !== undefined) {
    if (typeof updates.title !== 'string' || !updates.title.trim()) return err('标题不能为空');
    if (updates.title.length > 100) return err('标题最多 100 字');
    data.title = updates.title.trim();
  }
  if (updates.description !== undefined) {
    if (typeof updates.description !== 'string' || updates.description.length > 2000) return err('描述最多 2000 字');
    data.description = updates.description.trim();
  }
  if (updates.price !== undefined) {
    if (updates.price !== null && (typeof updates.price !== 'number' || updates.price < 0)) return err('价格不合法');
    data.price = updates.price === null ? null : Math.round(updates.price);
  }
  if (updates.category !== undefined) {
    if (!VALID_CATEGORIES.includes(updates.category)) return err('分类不合法');
    data.category = updates.category;
  }
  if (updates.customTag !== undefined) data.customTag = updates.customTag?.trim() || null;
  if (updates.contactType !== undefined) {
    if (!VALID_CONTACT_TYPES.includes(updates.contactType)) return err('联系方式类型不合法');
    data.contactType = updates.contactType;
  }
  if (updates.contactValue !== undefined) {
    if (typeof updates.contactValue !== 'string' || !updates.contactValue.trim()) return err('联系方式不能为空');
    data.contactValue = updates.contactValue.trim();
  }
  if (updates.customContactLabel !== undefined) {
    data.customContactLabel = updates.customContactLabel?.trim() || null;
  }
  if (updates.photoUrls !== undefined) {
    if (!Array.isArray(updates.photoUrls) || updates.photoUrls.length > 6) return err('图片最多 6 张');
    data.photoUrls = serializePhotoUrls(updates.photoUrls);
  }
  if (updates.type !== undefined) {
    if (updates.type !== 'sell' && updates.type !== 'buy') return err('类型不合法');
    data.type = updates.type;
  }

  // 实质性更新才 bump 到列表前面：标题/描述/价格/图片/类型/分类变了算；
  // 仅改联系方式 / customTag 不算（typo 修复、改个标签不应奖励排名）
  const SUBSTANTIVE = ['title', 'description', 'price', 'photoUrls', 'type', 'category'] as const;
  const hasSubstantiveChange = SUBSTANTIVE.some(k => updates[k] !== undefined);
  if (hasSubstantiveChange) {
    data.bumpedAt = new Date();
  }

  await prisma.item.update({ where: { id }, data });

  // 编辑时如果替换了图，把被丢弃的 Cloudinary 图清掉（节省额度）
  if (updates.photoUrls !== undefined) {
    const oldUrls = parsePhotoUrls(item.photoUrls);
    const newUrls: string[] = Array.isArray(updates.photoUrls) ? updates.photoUrls : [];
    const removed = oldUrls.filter(u => !newUrls.includes(u));
    if (removed.length > 0) {
      // 延迟 24h 删图（防止用户后悔）
      schedulePendingCloudinaryDeletion(removed).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/items/[id]  删除（标记为已售出 = 删除）
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const sp = req.nextUrl.searchParams;
  const editCode = sp.get('editCode') ?? '';
  if (!editCode) return err('请提供密码');

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item || item.status !== 'active') return err('商品不存在', 404);

  const ok = await bcrypt.compare(editCode, item.editCodeHash);
  if (!ok) return err('密码错误', 401);

  // 软删
  await prisma.item.update({ where: { id }, data: { status: 'deleted' } });

  // 延迟 24h 清掉 Cloudinary 图床上的图（防止卖家手滑误删后图也丢了）；本地 /uploads/ 的图保留
  // 真正 destroy 由 processOverduePendingDeletions 在后续 GET 时机会式触发
  const urls = parsePhotoUrls(item.photoUrls);
  schedulePendingCloudinaryDeletion(urls).catch(() => {});

  return NextResponse.json({ success: true });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
