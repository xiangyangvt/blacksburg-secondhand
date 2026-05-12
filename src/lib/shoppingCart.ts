// 二手购物清单 —— 纯 client-side（localStorage）
// 设计：snapshot 每件物品的关键字段，加入时主动调 reveal API 把 contactValue 一起拍进来
// 这样 /cart 页面不用每次 fetch 就能渲染；卖家也通过 reveal count 收到"被关注"信号

const KEY = 'hb_shopping_cart';
const MAX = 50;
const EVT = 'hb-cart-changed';

export type CartItem = {
  id: string;
  addedAt: number;
  title: string;
  price: number | null;
  itemType: 'sell' | 'buy';
  category: string;
  photoUrl: string | null;
  contactType: string;
  contactValue: string;
  customContactLabel: string | null;
};

function load(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(cart: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cart));
    // 同一标签里的其他组件（CartButton 徽章、ItemCard 按钮状态）通过 custom event 同步
    // 跨标签自动有 storage event
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* 静默失败 */
  }
}

export function getCart(): CartItem[] {
  return load();
}

export function isInCart(itemId: string): boolean {
  return load().some(c => c.id === itemId);
}

/**
 * 加入清单（已存在则忽略）。
 * 返回：
 *   - true: 加成功
 *   - 'exists': 已经在清单里
 *   - 'full': 达到上限 50
 */
export function addToCart(snapshot: Omit<CartItem, 'addedAt'>): true | 'exists' | 'full' {
  const cart = load();
  if (cart.some(c => c.id === snapshot.id)) return 'exists';
  if (cart.length >= MAX) return 'full';
  cart.push({ ...snapshot, addedAt: Date.now() });
  save(cart);
  return true;
}

export function removeFromCart(itemId: string): void {
  save(load().filter(c => c.id !== itemId));
}

export function removeMany(ids: string[]): void {
  const set = new Set(ids);
  save(load().filter(c => !set.has(c.id)));
}

/**
 * 跟服务端 active items 同步。
 *   - 找到匹配 id → 更新 snapshot（title/price/photoUrl/contactValue 等保鲜）
 *   - 找不到 → 直接移除（item 被卖家删除 / 隐藏；按 Sean 要求不提示用户，静默消失）
 * 触发：主页 fetchItems 后；/cart 页面打开时
 */
export function syncCart(items: Array<{
  id: string;
  title: string;
  price: number | null;
  type: 'sell' | 'buy';
  category: string;
  photoUrls: string[];
  contactType: string;
  contactValue?: string;  // 公开 GET 已脱敏成空字符串
  customContactLabel?: string | null;
}>): void {
  const cart = load();
  if (cart.length === 0) return;
  const byId = new Map(items.map(it => [it.id, it]));
  const next: CartItem[] = [];
  for (const c of cart) {
    const it = byId.get(c.id);
    if (!it) continue; // 已下架/删除 → 静默移除
    next.push({
      ...c,
      title: it.title,
      price: it.price,
      itemType: it.type,
      category: it.category,
      photoUrl: it.photoUrls[0] ?? null,
      // 公开 GET 里 contactValue 为空字符串；只在它有值时才更新（保留旧 snapshot 不被擦）
      contactType: it.contactType || c.contactType,
      contactValue: it.contactValue && it.contactValue.length > 0 ? it.contactValue : c.contactValue,
      customContactLabel: typeof it.customContactLabel === 'string' ? it.customContactLabel : c.customContactLabel,
    });
  }
  // 只在有变化时才写回，避免无谓 dispatch
  if (next.length !== cart.length || next.some((n, i) => JSON.stringify(n) !== JSON.stringify(cart[i]))) {
    save(next);
  }
}

/**
 * 订阅 cart 变化（同标签 + 跨标签）
 */
export function subscribeCart(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) cb();
  });
  return () => {
    window.removeEventListener(EVT, handler);
    // storage handler 用 closure，没存引用，全局 listener 不会泄漏（页面卸载时浏览器自动清）
  };
}
