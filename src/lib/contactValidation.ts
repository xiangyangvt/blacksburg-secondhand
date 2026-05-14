// 联系方式 / 价格的轻量校验 —— non-blocking,只产生警告
// 心理学依据:Reactance(强制 → 反向心理)。校验失败不阻止提交,只软提示
// 注:ContactType 已在 lib/utils.ts 导出,这里函数签名直接接受 string,各表单 contactType 类型不一也能通过

export interface ValidationResult {
  ok: boolean;
  warning?: string;
}

// 微信号:首字符英文,长度 6-20,允许 字母/数字/_/-
const WECHAT_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/;

// 邮箱:松校验(没必要 RFC 5322 严格,挡住明显错误就行)
const EMAIL_LOOSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 校验联系方式
 * - 空值返回 ok(必填校验由外层管)
 * - 失败时返回 warning,UI 用 toast.warning 显示但不阻塞提交
 */
export function validateContact(type: string, value: string): ValidationResult {
  const v = value.trim();
  if (!v) return { ok: true }; // 空值由必填校验管,不归这里

  switch (type) {
    case 'wechat': {
      // 11 位纯数字 → 大概率是手机号,建议切换 type
      if (/^\d{11}$/.test(v)) {
        return { ok: false, warning: '看起来像手机号,要切到「手机」类型吗?' };
      }
      if (!WECHAT_REGEX.test(v)) {
        return { ok: false, warning: '微信号通常是英文开头,6-20 位字母/数字' };
      }
      return { ok: true };
    }
    case 'phone': {
      // 美国常见格式:10 位或 11 位(带国家码 1)。容忍 空格 / 横杠 / 括号
      const digits = v.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) {
        return { ok: false, warning: '电话号通常是 10-11 位数字' };
      }
      return { ok: true };
    }
    case 'email': {
      if (!EMAIL_LOOSE.test(v)) {
        return { ok: false, warning: '邮箱格式不对,缺 @ 或 .' };
      }
      return { ok: true };
    }
    case 'other':
    default:
      return { ok: true }; // 自定义类型(Discord/Instagram 等)不校验
  }
}

/** 根据 contactType 返回智能 placeholder */
export function contactPlaceholder(type: string): string {
  switch (type) {
    case 'wechat': return '例: yangxiang5136(英文+数字)';
    case 'phone':  return '例: 5401234567(10-11 位)';
    case 'email':  return '例: yang@vt.edu';
    case 'other':  return '例: Discord/Instagram 等';
    default:       return '';
  }
}

/**
 * 价格软警告(UX-4)
 * - > 99999:硬警告(input 的 max attr 也会拦但这里兜底)
 * - > 5000:软警告,二手定价偏高
 */
export function validatePriceSoft(price: number | null): ValidationResult {
  if (price === null || price === undefined || !Number.isFinite(price)) {
    return { ok: true };
  }
  if (price > 99999) {
    return { ok: false, warning: '价格上限 $99999,超过请联系站长' };
  }
  if (price > 5000) {
    return { ok: false, warning: `$${price} 二手定价偏高,确认一下` };
  }
  return { ok: true };
}
