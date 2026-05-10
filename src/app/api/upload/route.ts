// 图片上传：自动用 Cloudinary（如果配了环境变量）或本地兜底

import { NextRequest, NextResponse } from 'next/server';
import { uploadImage, isCloudinaryAvailable } from '@/lib/uploader';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB（前端会先压缩，这只是兜底）
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '请上传文件' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '图片不能超过 5MB' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: '只支持 JPG/PNG/WebP/GIF' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await uploadImage(buffer, file.type);
    return NextResponse.json({
      url: result.url,
      storage: result.storage,        // 前端可选忽略
      publicId: result.publicId,      // Cloudinary 才有
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `上传失败: ${e?.message ?? 'unknown error'}` },
      { status: 500 },
    );
  }
}

// 健康检查：让你能在浏览器看当前用的是哪种存储
export async function GET() {
  return NextResponse.json({
    cloudinaryConfigured: isCloudinaryAvailable(),
    storage: isCloudinaryAvailable() ? 'cloudinary' : 'local',
  });
}
