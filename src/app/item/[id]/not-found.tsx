import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-lg border border-stone-200 p-6 text-center">
        <div className="text-5xl mb-3">🤷</div>
        <h1 className="text-lg font-bold text-stone-900 mb-2">商品不存在或已下架</h1>
        <p className="text-sm text-stone-500 mb-5">可能已被卖家删除，或者链接错误。</p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-brand text-white rounded-full hover:bg-brand-dark text-sm font-medium"
        >
          ← 回到首页
        </Link>
      </div>
    </main>
  );
}
