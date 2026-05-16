// Phase 2C 联系方式类型注册表

export const CONTACT_TYPES = [
  { id: 'wechat',  label: '微信',    placeholder: '微信号' },
  { id: 'phone',   label: '手机',    placeholder: '电话号码,如 540-xxx-xxxx' },
  { id: 'discord', label: 'Discord', placeholder: 'Discord 用户名' },
  { id: 'email',   label: 'Email',   placeholder: '邮箱' },
  { id: 'other',   label: '其他',    placeholder: '具体联系方式' },
] as const;

export type ContactType = typeof CONTACT_TYPES[number]['id'];

export function contactTypeLabel(t: string | null | undefined, customLabel?: string | null): string {
  if (t === 'other' && customLabel) return customLabel;
  return CONTACT_TYPES.find(x => x.id === t)?.label ?? '联系方式';
}

/** 输入验证 — 非空 + 长度合理 */
export function validateContactInput(
  type: ContactType,
  value: string,
  label?: string,
): { ok: boolean; error?: string } {
  const v = value.trim();
  if (!v) return { ok: false, error: '请填写联系方式' };
  if (v.length > 80) return { ok: false, error: '联系方式过长(最多 80 字符)' };
  if (type === 'other' && (!label || !label.trim())) {
    return { ok: false, error: '请填写「其他」联系方式的类型(如 Line / Telegram)' };
  }
  // 不强制 regex 校验 — 用户填什么都可能,要包容
  return { ok: true };
}
