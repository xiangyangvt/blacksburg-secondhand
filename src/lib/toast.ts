// 统一的 toast 入口 —— 包一层 sonner,方便后续切换 + 集中调节默认行为
// 替代旧的 alert();confirm() 因为 destructive 操作需要阻塞,暂留 native confirm()

import { toast as sonnerToast } from 'sonner';
import type { ExternalToast } from 'sonner';

/** 成功 toast(绿色)—— 复制成功 / 已发布 / 已删除 等 */
export function showSuccess(message: string, options?: ExternalToast) {
  return sonnerToast.success(message, options);
}

/** 错误 toast(红色)—— API 失败 / 校验错误 等。默认停 5s 给用户读 */
export function showError(message: string, options?: ExternalToast) {
  return sonnerToast.error(message, { duration: 5000, ...options });
}

/** 中性 toast —— 一般提示 */
export function showInfo(message: string, options?: ExternalToast) {
  return sonnerToast(message, options);
}

/** 警告 toast(琥珀色)—— 软警告:限速触发 / 容量满了 等 */
export function showWarning(message: string, options?: ExternalToast) {
  return sonnerToast.warning(message, options);
}

/** 直接 re-export 原始 sonner toast,用于 toast.custom / toast.promise 等高级用法
 *  UX-13 同卖家曝光会用 toast.custom 渲染富内容 */
export { sonnerToast as toast };
