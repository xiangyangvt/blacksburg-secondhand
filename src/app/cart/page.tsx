// /cart 旧路由 —— Sean 决定走扁平化，购物清单改成主页内悬浮 panel
// 这里保留 URL 兜底：访问 /cart 跳回 /?openCart=1，主页会自动打开 panel
// 这样之前分享 /cart 的链接还能用

import { redirect } from 'next/navigation';

export default function CartRedirect() {
  redirect('/?openCart=1');
}
