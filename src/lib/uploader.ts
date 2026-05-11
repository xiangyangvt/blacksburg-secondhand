// 智能上传：检测到 Cloudinary 环境变量就上云，否则存本地 public/uploads/
// 这样开源贡献者 / 本地开发不用配 Cloudinary 也能跑

import { v2 as cloudinary } from 'cloudinary';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export type UploadResult = {
  url: string;
  storage: 'cloudinary' | 'local';
  publicId?: string; // 仅 cloudinary
};

let cloudinaryConfigured = false;
function ensureCloudinaryConfigured() {
  if (cloudinaryConfigured) return true;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return false;
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key:    CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  cloudinaryConfigured = true;
  return true;
}

export function isCloudinaryAvailable(): boolean {
  return ensureCloudinaryConfigured();
}

/** 上传到 Cloudinary（推荐，生产用） */
async function uploadToCloudinary(buffer: Buffer, mime: string): Promise<UploadResult> {
  ensureCloudinaryConfigured();
  // Cloudinary 接受 base64 data URI
  const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'blacksburg-secondhand',
    resource_type: 'image',
    // 自动优化：质量 + 格式（自动转 webp/avif 给支持的浏览器）
    transformation: [
      { quality: 'auto:good', fetch_format: 'auto' },
      { width: 1600, height: 1600, crop: 'limit' },
    ],
  });
  return {
    url: result.secure_url,
    storage: 'cloudinary',
    publicId: result.public_id,
  };
}

/** 存到本地 public/uploads/（仅本地开发兜底） */
async function uploadToLocal(buffer: Buffer, mime: string): Promise<UploadResult> {
  const ext = (mime.split('/')[1] ?? 'bin').replace('jpeg', 'jpg');
  const filename = `${crypto.randomUUID()}.${ext}`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);
  return {
    url: `/uploads/${filename}`,
    storage: 'local',
  };
}

/** 主入口：自动选 Cloudinary 或本地 */
export async function uploadImage(buffer: Buffer, mime: string): Promise<UploadResult> {
  if (isCloudinaryAvailable()) {
    return uploadToCloudinary(buffer, mime);
  }
  return uploadToLocal(buffer, mime);
}

/** 删除 Cloudinary 上的图（用于"已售出"清理；本地图先不删） */
export async function deleteCloudinaryImage(publicId: string): Promise<void> {
  if (!isCloudinaryAvailable()) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // 删除失败不阻塞主流程
  }
}

/**
 * 从 Cloudinary URL 反解 publicId。
 * 现存数据只存 URL 不存 publicId，所以软删时通过此函数提取。
 *
 * 例：
 *   https://res.cloudinary.com/demo/image/upload/q_auto:good,f_auto/c_limit,h_1600,w_1600/v1234567890/blacksburg-secondhand/abc123.jpg
 *   → "blacksburg-secondhand/abc123"
 *
 * 非 Cloudinary URL（本地 /uploads/... 或外站）返回 null。
 */
export function extractCloudinaryPublicId(url: string): string | null {
  if (typeof url !== 'string' || !url.includes('res.cloudinary.com')) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const parts = pathname.split('/').filter(Boolean);
  // 路径：/<cloud_name>/image/upload/[transformations.../][v<digits>/]<publicId>.<ext>
  const uploadIdx = parts.indexOf('upload');
  if (uploadIdx === -1 || uploadIdx === parts.length - 1) return null;
  let after = parts.slice(uploadIdx + 1);

  // 剥 transformation 段：以 "<letter>_" 开头（如 q_auto, c_limit, w_1600, ar_16:9 等）
  while (after.length > 1 && /^[a-z]_/.test(after[0])) {
    after = after.slice(1);
  }
  // 剥 version 段：v<digits>
  if (after.length > 1 && /^v\d+$/.test(after[0])) {
    after = after.slice(1);
  }
  if (after.length === 0) return null;

  // 剩下的是 publicId（含 folder），去掉扩展名
  const full = after.join('/');
  return full.replace(/\.[a-zA-Z0-9]+$/, '');
}

/** 批量删除一组图（接受 URL 数组，自动跳过本地 / 非 Cloudinary 的）。失败不抛错。 */
export async function deleteCloudinaryImagesByUrls(urls: string[]): Promise<void> {
  if (!isCloudinaryAvailable()) return;
  const publicIds = urls
    .map(extractCloudinaryPublicId)
    .filter((id): id is string => !!id);
  await Promise.allSettled(publicIds.map(id => deleteCloudinaryImage(id)));
}
