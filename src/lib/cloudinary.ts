// Cloudinary URL 工具：通过 URL 内联 transformation 获取不同尺寸/格式的图
// 不需要 SDK，纯字符串拼接，client + server + edge runtime 都能用

/**
 * 把任意 Cloudinary URL 转换成指定尺寸的缩略图。
 * 在 /upload/ 后插入新的 transformation chain，让 Cloudinary 在 CDN 边缘做裁剪。
 *
 * @param size 边长（正方形 c_fill 裁剪）；默认 400
 * @param format Cloudinary 格式参数：'auto' = 按 UA 头返回 webp/avif/jpg；
 *               'jpg' = 强制 jpeg（微信、QQ、老安卓浏览器最稳）；
 *               'webp' = 强制 webp（体积最小）
 *
 * 非 Cloudinary URL（本地 /uploads/、外站）原样返回。
 */
export function toCloudinaryThumb(
  url: string,
  size = 400,
  format: 'auto' | 'jpg' | 'webp' = 'auto',
): string {
  if (typeof url !== 'string' || !url) return url;
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  // 防重复插入（已经处理过的 URL 含我们插入的 marker）
  if (url.includes(`c_fill,w_${size}`)) return url;
  return url.replace(
    '/upload/',
    `/upload/c_fill,w_${size},h_${size},q_auto:good,f_${format}/`,
  );
}
