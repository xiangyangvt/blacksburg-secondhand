// 共享的 item 字段校验逻辑（单条发布 + 批量导入 + 编辑都会用）

import { CATEGORIES, CONTACT_TYPES } from './utils';

const VALID_CATEGORIES = CATEGORIES.map(c => c.id);
const VALID_CONTACT_TYPES = CONTACT_TYPES.map(c => c.id);

/** 校验商品字段；返回错误字符串或 null（合法） */
export function validateItemFields(f: any): string | null {
  if (f.type !== 'sell' && f.type !== 'buy') return '类型必须是 sell 或 buy';
  if (typeof f.title !== 'string' || !f.title.trim()) return '标题不能为空';
  if (f.title.length > 100) return '标题最多 100 字';
  if (typeof f.description !== 'string' || f.description.length > 2000) return '描述最多 2000 字';
  if (f.price !== null && (typeof f.price !== 'number' || f.price < 0 || f.price > 1_000_000)) return '价格不合法';
  if (!VALID_CATEGORIES.includes(f.category)) return '分类不合法';
  if (!VALID_CONTACT_TYPES.includes(f.contactType)) return '联系方式类型不合法';
  if (typeof f.contactValue !== 'string' || !f.contactValue.trim()) return '联系方式不能为空';
  if (!Array.isArray(f.photoUrls) || f.photoUrls.length > 6) return '图片最多 6 张';
  return null;
}
