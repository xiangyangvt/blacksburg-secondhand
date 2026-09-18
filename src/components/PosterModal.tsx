'use client';

// Sprint 11C:一键长图 —— 展示与保存
//
// 图是服务端出的真实 PNG(<img src="/api/poster/<slug>?page=N">):
//   - 微信内置浏览器 / 手机:长按图片 → 保存 / 转发(canvas 下载按钮在微信里不可用,所以不走那条路)
//   - 桌面:每张图下面一个下载链接
// 物品多时分成几张(每张都带二维码),一张一张往下排。

import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { useT } from '@/i18n/I18nProvider';

export function PosterModal({ slug, pages, onClose }: { slug: string; pages: number; onClose: () => void }) {
  const t = useT();
  // 同一次打开用同一个时间戳:绕开 60 秒私有缓存拿最新内容,又不让长按保存时再渲染一遍
  const [stamp] = useState(() => Date.now());
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center overflow-y-auto p-3 sm:p-6" onClick={onClose} data-testid="poster-modal">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl my-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
          <div>
            <div className="text-sm font-semibold text-stone-900">{t('poster.title')}</div>
            <div className="text-xs text-stone-500 mt-0.5">{t('poster.hint')}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('poster.close')} className="p-1.5 -m-1.5 text-stone-400 hover:text-stone-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 space-y-4 bg-stone-100 rounded-b-xl">
          {Array.from({ length: pages }, (_, i) => i + 1).map(page => {
            const src = `/api/poster/${slug}?page=${page}&t=${stamp}`;
            return (
              <div key={page}>
                {failed[page] ? (
                  <div className="text-center text-sm text-rose-600 py-10 bg-white rounded-lg">{t('poster.failed')}</div>
                ) : (
                  <>
                    {!loaded[page] && <div className="aspect-[3/5] bg-white rounded-lg animate-pulse flex items-center justify-center text-sm text-stone-400">{t('poster.loading')}</div>}
                    {/* 普通 <img>:next/image 会改写地址、加懒加载,微信长按保存拿到的就不是原图了 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={t('poster.alt', { page, pages })}
                      className={`w-full rounded-lg shadow-card ${loaded[page] ? '' : 'hidden'}`}
                      onLoad={() => setLoaded(s => ({ ...s, [page]: true }))}
                      onError={() => setFailed(s => ({ ...s, [page]: true }))}
                    />
                  </>
                )}
                {loaded[page] && (
                  <a
                    href={src}
                    download={`blacksburg-${slug}-${page}.png`}
                    className="mt-2 hidden sm:inline-flex items-center gap-1.5 text-sm text-brand hover:text-brand-dark"
                  >
                    <Download size={14} />
                    {pages > 1 ? t('poster.downloadN', { page }) : t('poster.download')}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
