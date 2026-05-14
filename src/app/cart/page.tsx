// /cart 旧路由 —— Sean 决定走扁平化，心愿单改成主页内悬浮 panel
// 这里保留 URL 兜底：访问 /cart 跳回 /?openWishlist=1，主页会自动打开 panel
// 这样之前分享 /cart 的链接还能用（主页同时接受 ?openCart=1 旧参数）

import { redirect } from 'next/navigation';

export default function CartRedirect() {
  redirect('/?openWishlist=1');
}
