// 统一身份 facade(UX B6)—— 打通站内三处身份存储,让用户在任一处填过身份后
// 另一处不必重新填。选择「路径 B:保持 schema,互相预填」:零 schema/API 改动,
// 纯 client-side 读写拉通。
//
// 现有三个店(都保留,facade 只做双写 + 回退读):
//   - hb_my_contact_type / hb_my_contact_value / hb_my_contact_label
//       二手询价(InquirySection)写;notifications.ts / MyPostsPanel 也读 value
//   - hb_last_contact  { contactType, contact, contactLabel }
//       活动响应 / 发送联系方式(ContactSendModal)写
//   - hb_nickname
//       活动评论展示名(eventNickname.ts)
//
// 类型对齐:二手侧只有 wechat|phone|email|other;活动侧多一个 discord,
// 映射到二手侧时降为 other + label 'Discord'。

import {
  getLastContact,
  setLastContact,
  getNickname,
  type SavedContactInput,
} from './eventNickname';

const LS_TYPE = 'hb_my_contact_type';
const LS_VALUE = 'hb_my_contact_value';
const LS_LABEL = 'hb_my_contact_label';

export type InquiryContactType = 'wechat' | 'phone' | 'email' | 'other';

export type SharedContact = {
  contactType: InquiryContactType;
  contactValue: string;
  customLabel: string;
};

/** 读联系方式:优先二手键,回退活动键(hb_last_contact) */
export function getSharedContact(): SharedContact | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(LS_VALUE);
    if (v) {
      const tp = localStorage.getItem(LS_TYPE);
      return {
        contactType:
          tp === 'wechat' || tp === 'phone' || tp === 'email' || tp === 'other'
            ? tp
            : 'other',
        contactValue: v,
        customLabel: localStorage.getItem(LS_LABEL) ?? '',
      };
    }
  } catch {
    /* private mode 等 */
  }
  const last = getLastContact();
  if (last && last.contact) {
    if (last.contactType === 'discord') {
      return { contactType: 'other', contactValue: last.contact, customLabel: last.contactLabel || 'Discord' };
    }
    return {
      contactType: last.contactType,
      contactValue: last.contact,
      customLabel: last.contactLabel ?? '',
    };
  }
  return null;
}

/** 写联系方式:双写两侧的键,任一处提交成功后调用 */
export function rememberSharedContact(
  type: SavedContactInput['contactType'],
  value: string,
  label?: string,
): void {
  if (typeof window === 'undefined' || !value) return;
  const inquiryType: InquiryContactType = type === 'discord' ? 'other' : type;
  const inquiryLabel = type === 'discord' ? (label || 'Discord') : label;
  try {
    localStorage.setItem(LS_TYPE, inquiryType);
    localStorage.setItem(LS_VALUE, value);
    if (inquiryLabel) localStorage.setItem(LS_LABEL, inquiryLabel);
  } catch {
    /* */
  }
  setLastContact({ contactType: type, contact: value, contactLabel: label || undefined });
}

/**
 * 活动评论昵称预填:优先昵称,没填过昵称就回退联系方式值(如微信号)。
 * 注:回退值会作为评论展示名公开;用户可在发布前修改。
 * 与 C10(联系方式直显)的开放取向一致,PR 里已注明该行为。
 */
export function getDisplayNameFallback(): string | null {
  const n = getNickname();
  if (n) return n;
  return getSharedContact()?.contactValue ?? null;
}
