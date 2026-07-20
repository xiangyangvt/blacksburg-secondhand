// Node 22+ 自带实验性 WebStorage:`localStorage` 是 globalThis 上的 getter,
// 未配 --localstorage-file 时返回 undefined;vitest 的 happy-dom 环境装载器
// 看到 key 已存在就不再注入自己的实现,于是 window.localStorage 也是 undefined,
// 所有 localStorage 相关单测在新版 Node 下挂掉(localStorage.clear is undefined)。
// 兜底:检测到 storage 不可用时,注入一个内存版 Storage(行为覆盖单测所需 API)。
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => { store.clear(); },
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => [...store.keys()][i] ?? null,
    removeItem: (k: string) => { store.delete(k); },
    setItem: (k: string, v: string) => { store.set(String(k), String(v)); },
  } as Storage;
}

const g = globalThis as any;
if (!g.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(), writable: true, configurable: true,
  });
}
if (!g.sessionStorage) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: createMemoryStorage(), writable: true, configurable: true,
  });
}
