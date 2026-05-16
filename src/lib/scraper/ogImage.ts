// og:image 抓取 helper(Sprint 7 Phase 1.9)
//
// 用途:列表页没有 event thumbnails 的源(如 nextthreedays),用详情页的
// <meta property="og:image"> 作为缩略图 fallback。
//
// 设计取舍:
// - 纯字符串正则,不上 cheerio(避免依赖);<head> 里 meta 标签结构简单,
//   正则足够稳定。失败 fail silent,never throw。
// - 并发池限 8,避免被源站当 DDoS;每请求 6 秒超时,坏页面不能拖死全 batch。
// - 失败成本可控:img null fallback 已经做了类型色占位,LLM 抽不到 / og 抓不到 都不影响主流。

const UA = 'Mozilla/5.0 (compatible; BlacksburgLocalBot/1.0; +https://blacksburg-secondhand-production.up.railway.app)';
const TIMEOUT_MS = 6000;

/**
 * 抓一个 URL 的 og:image。
 * 失败 / 没找到 / 超时 → 返回 null,不抛。
 */
export async function fetchOgImage(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractOgImage(html, url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 通用 logo / 占位图 URL 特征 — 命中就拒绝(防止把网站 logo 当事件配图)
// 案例:nextthreedays 所有详情页 og:image 都是 n3dlogo.png,需要过滤
const GENERIC_IMAGE_PATTERNS = [
  /\blogo\b/i,
  /\bdefault[-_]?(image|og|share)\b/i,
  /\bplaceholder\b/i,
  /\bsite[-_]?icon\b/i,
];

function looksGeneric(url: string): boolean {
  return GENERIC_IMAGE_PATTERNS.some(re => re.test(url));
}

/**
 * 从 HTML 字符串里抓 og:image,处理相对路径 → 绝对路径。
 * 顺位:
 *   1. <meta property="og:image" content="...">
 *   2. <meta content="..." property="og:image">  (attr 反顺)
 *   3. <meta name="twitter:image" content="...">  (兜底)
 *
 * 过滤:URL 含 logo/default/placeholder 等通用占位特征 → 返回 null
 *      (源站如果把网站 logo 当 og:image,反而比无图更糟)
 */
export function extractOgImage(html: string, baseUrl: string): string | null {
  const patterns = [
    /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /<meta\s+[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const raw = m?.[1]?.trim();
    if (!raw) continue;

    let abs: string;
    try {
      abs = new URL(raw, baseUrl).href;
    } catch {
      abs = raw;
    }

    if (looksGeneric(abs)) continue; // 跳到下一个模式,但通常下一个也会是同款
    return abs;
  }
  return null;
}

/**
 * 批量回填 imageUrl,只对已经没图的 event 打详情页。
 * 并发池限 8,避免被源站封 IP。
 *
 * 注:直接 mutate events 数组里的对象(为了简洁) — caller 拿到的就是
 * 同一个数组,imageUrl 已 backfilled。
 */
export async function enrichImagesFromDetailPages<
  T extends { sourceUrl: string; imageUrl?: string | null },
>(events: T[], concurrency = 8): Promise<T[]> {
  const targets = events.filter(e => !e.imageUrl);
  if (targets.length === 0) return events;

  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < targets.length) {
      const i = idx++;
      const ev = targets[i];
      const img = await fetchOgImage(ev.sourceUrl);
      if (img) ev.imageUrl = img;
    }
  }
  const n = Math.min(concurrency, targets.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return events;
}
