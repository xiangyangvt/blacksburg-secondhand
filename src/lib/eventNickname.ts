// 站点级昵称(Phase 2C)
// localStorage 存一次,全站评论 / 发送联系方式都用同一个
//
// 注:这跟 visitorId(hb_vid cookie)不同 — visitorId 是 server 端 cookie,
// 用于身份匹配/去重;nickname 是用户自填的展示名,可改可不填

const KEY = 'hb_nickname';
const EVT = 'hb-nickname-changed';

export function getNickname(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setNickname(name: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = name.trim().slice(0, 20);
  try {
    localStorage.setItem(KEY, trimmed);
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* quota / private mode */
  }
}

export function subscribeNickname(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVT, cb);
  const storage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener('storage', storage);
  };
}

// 上次发联系方式时填的资料缓存(下次默认填入,但允许改)
const CONTACT_KEY = 'hb_last_contact';

export type SavedContactInput = {
  contactType: 'wechat' | 'phone' | 'discord' | 'email' | 'other';
  contact: string;
  contactLabel?: string;
};

export function getLastContact(): SavedContactInput | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONTACT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.contactType === 'string' && typeof v.contact === 'string') return v;
    return null;
  } catch {
    return null;
  }
}

export function setLastContact(v: SavedContactInput): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CONTACT_KEY, JSON.stringify(v)); }
  catch { /* */ }
}
