'use client';

// 室友 listing 心愿单 panel(Sprint 6.7)
// 跟 ShoppingCartPanel 同款外壳:遮罩 + 居中卡片 + ESC + 底部"收起"
// 内容:已收藏 listing 列表,可点开跳 /listing/[id],可移除

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import NextImage from 'next/image';
import { X, Trash2, ChevronUp, Home } from 'lucide-react';
import { getSavedListings, removeSavedListing, subscribeSavedListings, type SavedListing } from '@/lib/savedListings';
import { LISTING_TYPES, listingTypeBgClass } from '@/lib/utils';
import { KeyHeartIcon } from './KeyHeartIcon';

export function SavedListingsPanel({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<SavedListing[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ESC 关 + 锁滚动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    setList(getSavedListings());
    return subscribeSavedListings(() => setList(getSavedListings()));
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-stone-50 w-full max-w-2xl rounded-card shadow-overlay my-2 sm:my-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 */}
        <div className="sticky top-0 z-10 bg-white border-b border-stone-200 px-5 py-3 flex items-center gap-3 rounded-t-card">
          <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
            <KeyHeartIcon size={20} fill className="text-brand" />
            室友心愿单
            {list.length > 0 && (
              <span className="text-stone-500 text-sm font-normal">· {list.length} 条</span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="ml-auto text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100"
            aria-label="关闭"
          >
            <X size={22} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-3 sm:p-4">
          {list.length === 0 ? (
            <div className="text-center text-stone-500 py-16 bg-white rounded-lg border border-stone-200">
              <KeyHeartIcon size={56} strokeWidth={1.2} className="mx-auto mb-4 text-stone-300" />
              <div className="mb-3">室友心愿单是空的</div>
              <button
                onClick={onClose}
                className="text-brand underline hover:text-brand-dark"
              >
                去看看室友 listing →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {list.map(l => {
                const typeMeta = LISTING_TYPES.find(t => t.id === l.type);
                const budgetLabel = l.budgetMin || l.budgetMax
                  ? `$${l.budgetMin ?? '0'}–${l.budgetMax ?? '∞'}/月`
                  : null;
                return (
                  <div
                    key={l.id}
                    className="bg-white rounded-card border border-stone-200 px-3 py-2.5 flex items-center gap-3"
                  >
                    {l.photoUrl ? (
                      <NextImage
                        src={l.photoUrl}
                        alt=""
                        width={56}
                        height={56}
                        sizes="56px"
                        className="h-14 w-14 object-cover rounded flex-shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded flex-shrink-0 bg-stone-100 flex items-center justify-center text-stone-300">
                        <Home size={22} strokeWidth={1.2} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs mb-0.5">
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${listingTypeBgClass(l.type)}`}>
                          {typeMeta?.label ?? l.type}
                        </span>
                      </div>
                      <Link
                        href={`/listing/${l.id}`}
                        onClick={onClose}
                        className="block text-sm font-medium text-stone-900 truncate hover:text-brand"
                      >
                        {l.title}
                      </Link>
                      {budgetLabel && (
                        <div className="text-xs text-stone-500">{budgetLabel}</div>
                      )}
                    </div>
                    <button
                      onClick={() => removeSavedListing(l.id)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 flex-shrink-0"
                      title="移除"
                      aria-label="移除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部收起按钮 */}
        <div className="border-t border-stone-200 px-4 py-3 flex justify-center bg-stone-50 rounded-b-card">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-6 py-2 bg-white border border-stone-300 text-stone-700 rounded-chip hover:bg-stone-100 active:scale-95 text-sm font-medium transition-all shadow-card"
            aria-label="收起室友心愿单"
          >
            <ChevronUp size={16} />
            收起
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
