// UTM 跟踪：用户首次访问 URL 中带 ?utm_source=xxx 或 ?from=xxx 时记下来，
// 之后这个 session 内所有发布/询价/举报都带上这个 source。
//
// 写到 sessionStorage 而不是 localStorage —— 关一次浏览器或换 tab 重新计
// （因为长期 utm 会污染统计；每个 session 反映一次"是谁带他来的"）

const KEY = 'hb_utm_source';
const MAX_LEN = 64;

/** 客户端：从当前 URL 提取 utm_source / from，存到 sessionStorage（只在首次有值时写入） */
export function captureUtmFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    // 已经有 session 标记的，不覆盖（同一 session 内首次带量的来源胜出）
    const existing = window.sessionStorage.getItem(KEY);
    if (existing) return;

    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get('utm_source') ?? sp.get('from');
    if (!raw) return;

    const cleaned = String(raw).slice(0, MAX_LEN).replace(/[^a-zA-Z0-9_\-\.]/g, '');
    if (!cleaned) return;

    window.sessionStorage.setItem(KEY, cleaned);
  } catch {
    // ignore（隐私模式 sessionStorage 可能不可用）
  }
}

/** 客户端：拿到当前 session 的 utm_source（用于 fetch 时附带） */
export function getStoredUtmSource(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
