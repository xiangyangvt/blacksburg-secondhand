'use client';

// Sprint 11C:一键长图 —— 展示与保存
//
// 主操作是**「复制图片」**(Sean 2026-09-18:长按保存不舒服,桌面端也没法长按)——点一下,图进剪贴板,去微信直接粘贴。
//   - 走异步剪贴板 API:ClipboardItem 的值传 Promise<Blob>(Safari 要求 ClipboardItem 在点击的同步调用栈里创建)
//   - 复制成功:**屏幕正中**浮出一枚磨砂圆章(fixed,不随长图滚走)、对勾一笔画出,按钮变成绿色「已复制 · 去微信粘贴」,约 2 秒后还原
//   - 浏览器不支持(部分内置浏览器)或被拒:按钮不出现 / 提示改用长按保存
// 「下载图片」是并排的次要按钮,手机、桌面都显示。图本身仍是服务端出的真实 PNG(<img src="/api/poster/<slug>?page=N">),长按保存也还能用。
// 物品多时分成几张(每张都带二维码),一张一张往下排,每张各有自己的复制按钮。

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import { useT } from '@/i18n/I18nProvider';

export function PosterModal({ slug, pages, onClose }: { slug: string; pages: number; onClose: () => void }) {
  const t = useT();
  // 同一次打开用同一个时间戳:绕开 60 秒私有缓存拿最新内容,又不让长按保存时再渲染一遍
  const [stamp] = useState(() => Date.now());
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  // 能不能复制图片要到客户端才知道;SSR 与首帧一律当不能,避免水合不一致
  const [canCopy, setCanCopy] = useState(false);
  useEffect(() => {
    setCanCopy(typeof window !== 'undefined' && typeof window.ClipboardItem !== 'undefined' && !!navigator.clipboard?.write);
  }, []);
  const [copied, setCopied] = useState<number | null>(null);
  const [copiedAt, setCopiedAt] = useState(0);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async (page: number, src: string) => {
    setCopyFailed(false);
    try {
      // 不 await fetch 再建 ClipboardItem:Safari 只在用户手势的同步栈里放行,所以把 Promise 直接交进去
      const blob = fetch(src).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(page);
      setCopiedAt(Date.now());
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 2200);
    } catch {
      setCopied(null);
      setCopyFailed(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center overflow-y-auto p-3 sm:p-6" onClick={onClose} data-testid="poster-modal">
      {/* 「已复制」圆章:钉在**屏幕**正中(fixed),不跟图走——长图很长,用户多半已经滚到下面,
          挂在图上的话圆章会留在屏幕外的顶部看不见(Sean 2026-09-18 真机反馈)。key 带时间戳:连点两次也重播 */}
      {copied !== null && (
        <div
          key={`badge-${copied}-${copiedAt}`}
          className="hb-copied-badge pointer-events-none fixed left-1/2 top-1/2 z-[70] flex flex-col items-center justify-center w-36 h-36 rounded-full bg-white/85 backdrop-blur-md shadow-xl ring-1 ring-emerald-200"
          data-testid="copied-badge"
        >
          <span className="hb-copied-ring absolute inset-0 rounded-full ring-2 ring-emerald-400" />
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="11" fill="#10b981" />
            <path className="hb-copied-check" d="M6.5 12.5l3.6 3.6 7.4-7.8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="mt-2 text-sm font-semibold text-emerald-800">{t('poster.copied')}</span>
        </div>
      )}
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl my-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <div>
            <div className="text-sm font-semibold text-stone-900">{t('poster.title')}</div>
            <div className="text-xs text-stone-500 mt-0.5">{t(canCopy ? 'poster.hintCopy' : 'poster.hint')}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('poster.close')} className="p-1.5 -m-1.5 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 space-y-4 bg-stone-100 rounded-b-xl">
          {copyFailed && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">{t('poster.copyFailed')}</div>}
          {Array.from({ length: pages }, (_, i) => i + 1).map(page => {
            const src = `/api/poster/${slug}?page=${page}&t=${stamp}`;
            return (
              <div key={page}>
                {failed[page] ? (
                  <div className="text-center text-sm text-rose-600 py-10 bg-white rounded-lg">{t('poster.failed')}</div>
                ) : (
                  <>
                    {!loaded[page] && <div className="aspect-[3/5] bg-white rounded-lg animate-pulse flex items-center justify-center text-sm text-stone-400">{t('poster.loading')}</div>}
                    {/* 普通 <img>:next/image 会改写地址、加懒加载,长按保存 / 复制拿到的就不是原图了 */}
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={t('poster.alt', { page, pages })}
                        className={`w-full rounded-lg shadow-card ${loaded[page] ? '' : 'hidden'}`}
                        onLoad={() => setLoaded(s => ({ ...s, [page]: true }))}
                        onError={() => setFailed(s => ({ ...s, [page]: true }))}
                      />
                    </div>
                  </>
                )}
                {loaded[page] && (
                  <div className="mt-2.5 flex items-center gap-3 sticky bottom-2">
                    {canCopy && (
                      <button
                        type="button"
                        onClick={() => copy(page, src)}
                        data-testid="copy-poster"
                        aria-live="polite"
                        className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white shadow-card transition-colors duration-300 ${
                          copied === page ? 'bg-emerald-600' : 'bg-brand hover:bg-brand-dark'
                        }`}
                      >
                        {copied === page ? <Check size={16} strokeWidth={3} /> : <Copy size={16} />}
                        {copied === page ? t('poster.copiedGo') : pages > 1 ? t('poster.copyN', { page }) : t('poster.copy')}
                      </button>
                    )}
                    <a
                      href={src}
                      download={`blacksburg-${slug}-${page}.png`}
                      // 手机端也保留下载(Sean 2026-09-18):做成次要按钮,触控目标够大;没有复制按钮时它独占一行
                      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-stone-300 bg-white text-sm font-medium text-stone-700 hover:border-stone-400 shadow-card ${canCopy ? 'shrink-0' : 'flex-1'}`}
                      data-testid="download-poster"
                    >
                      <Download size={16} />
                      {t('poster.download')}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
