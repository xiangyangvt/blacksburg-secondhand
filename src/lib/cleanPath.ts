// 分享文案里链接后面常粘上标点(`/&`、`/'`、`/roommates。`),落到 404 后访客直接走掉。
// 这里只削路径末尾的标点;合法路径(商品 id、slug)从不以这些字符结尾。

const TRAILING_JUNK = /[&'"`,.;:!?)\]}>，。；：！？、）】》」』’”…]+$/;

/** 返回削掉末尾标点后的路径;不需要改时返回 null。 */
export function stripTrailingJunk(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const cleaned = decoded.replace(TRAILING_JUNK, '').replace(/\/+$/, '') || '/';
  if (cleaned === (decoded.replace(/\/+$/, '') || '/')) return null;
  return encodeURI(cleaned);
}
