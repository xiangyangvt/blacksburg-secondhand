'use client';

// 购物清单悬浮 panel —— 跟 MyPostsPanel 同款外壳：遮罩 + 居中卡片 + ESC + 底部"收起"按钮
// 之前是 /cart 独立路由，Sean 反馈要保持扁平化网站，改成主页内 modal 浮窗

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import NextImage from 'next/image';
import {
  Pencil, X, Trash2, CheckSquare, Square, ChevronDown, ChevronRight, ChevronUp, ShoppingBag,
} from 'lucide-react';
import {
  getCart, removeFromCart, removeMany, syncCart, subscribeCart, type CartItem,
} from '@/lib/shoppingCart';
import { contactTypeLabel, formatPrice, itemCopyText } from '@/lib/utils';
import { CopyButton } from './CopyButton';

export function ShoppingCartPanel({ onClose }: { onClose: () => void }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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

  // cart 数据加载 + 订阅变化
  useEffect(() => {
    setCart(getCart());
    const unsub = subscribeCart(() => setCart(getCart()));
    // 顺便拉一次最新 items 同步 snapshot（更新价格 / 下架的静默删）
    fetch('/api/items?sort=newest')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.items) syncCart(d.items); })
      .catch(() => {});
    return unsub;
  }, []);

  // 按 contactValue 分组
  const groups = useMemo(() => {
    const m = new Map<string, CartItem[]>();
    for (const c of cart) {
      const key = c.contactValue || '(未知卖家)';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return Array.from(m.entries()).map(([contactValue, items]) => ({ contactValue, items }));
  }, [cart]);

  const totalSelected = selected.size;

  const toggleSel = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroupSel = (group: { contactValue: string; items: CartItem[] }) => {
    const ids = group.items.map(i => i.id);
    setSelected(prev => {
      const allIn = ids.every(id => prev.has(id));
      const next = new Set(prev);
      if (allIn) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const removeSelected = () => {
    if (totalSelected === 0) return;
    if (!confirm(`删除选中的 ${totalSelected} 项？`)) return;
    removeMany(Array.from(selected));
    setSelected(new Set());
  };

  const removeGroup = (group: { contactValue: string; items: CartItem[] }) => {
    if (!confirm(`删除该卖家的所有 ${group.items.length} 件商品？`)) return;
    removeMany(group.items.map(i => i.id));
  };

  const toggleCollapse = (cv: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cv)) next.delete(cv);
      else next.add(cv);
      return next;
    });
  };

  const groupBatchText = (group: { contactValue: string; items: CartItem[] }) => {
    const lines = group.items.map(i => `· ${itemCopyText(i.title, i.price, i.itemType, i.category)}`);
    return `你好，我想买你发布的这几件：\n${lines.join('\n')}`;
  };

  // Portal 到 body：跳出主页 sticky header 的 backdrop-blur stacking context，
  // 否则 panel 的 fixed 定位会被困在 header 的 z-30 层里，导致 modal 不能盖住主页内容
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-stone-50 w-full max-w-3xl rounded-card shadow-overlay my-2 sm:my-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 */}
        <div className="sticky top-0 z-10 bg-white border-b border-stone-200 px-5 py-3 flex items-center gap-3 rounded-t-card">
          <h2 className="text-lg font-semibold text-stone-900 flex items-center gap-2">
            <ShoppingBag size={20} className="text-brand" />
            购物清单
            {cart.length > 0 && <span className="text-stone-500 text-sm font-normal">· {cart.length} 件</span>}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            {cart.length > 0 && (
              <button
                onClick={() => { setEditing(e => !e); setSelected(new Set()); }}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-chip border text-sm transition-colors ${
                  editing
                    ? 'bg-brand text-white border-brand'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                }`}
              >
                {editing ? <X size={14} /> : <Pencil size={14} />}
                {editing ? '完成' : '编辑'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100"
              aria-label="关闭"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* 编辑模式 sticky 操作条 */}
        {editing && cart.length > 0 && (
          <div className="bg-stone-900 text-white px-5 py-2 text-sm flex items-center justify-between sticky top-[57px] z-10">
            <span>已选 {totalSelected} 项</span>
            <button
              onClick={removeSelected}
              disabled={totalSelected === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              <Trash2 size={13} />
              删除选中
            </button>
          </div>
        )}

        {/* 内容 */}
        <div className="p-3 sm:p-4">
          {cart.length === 0 ? (
            <div className="text-center text-stone-500 py-16 bg-white rounded-lg border border-stone-200">
              <ShoppingBag size={56} strokeWidth={1.2} className="mx-auto mb-4 text-stone-300" />
              <div className="mb-3">购物清单是空的</div>
              <button
                onClick={onClose}
                className="text-brand underline hover:text-brand-dark"
              >
                去二手挑挑看 →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(g => {
                const isCollapsed = collapsed.has(g.contactValue);
                const allIds = g.items.map(i => i.id);
                const allSel = editing && allIds.every(id => selected.has(id));
                const someSel = editing && allIds.some(id => selected.has(id));
                const firstItem = g.items[0];
                const contactType = firstItem?.contactType ?? '';
                const customLabel = firstItem?.customContactLabel ?? null;

                return (
                  <section key={g.contactValue} className="bg-white rounded-card border border-stone-200 overflow-hidden">
                    <header className="flex items-center gap-2 px-3 py-2.5 bg-stone-50 border-b border-stone-200">
                      {editing && (
                        <button
                          onClick={() => toggleGroupSel(g)}
                          className="text-stone-700 hover:text-brand"
                          aria-label="选中整组"
                        >
                          {allSel
                            ? <CheckSquare size={18} className="text-brand" />
                            : someSel
                              ? <CheckSquare size={18} className="text-brand opacity-50" />
                              : <Square size={18} />}
                        </button>
                      )}
                      <button
                        onClick={() => toggleCollapse(g.contactValue)}
                        className="text-stone-500 hover:text-stone-900"
                        aria-label={isCollapsed ? '展开' : '折叠'}
                      >
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </button>
                      <div className="flex-1 min-w-0 truncate text-sm">
                        <span className="text-stone-500">{contactTypeLabel(contactType, customLabel, 'zh')}: </span>
                        <span className="font-mono text-stone-900 select-all">{g.contactValue}</span>
                        <span className="text-stone-400 ml-2">({g.items.length} 件)</span>
                      </div>
                      {editing ? (
                        <button
                          onClick={() => removeGroup(g)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-rose-600 hover:bg-rose-50"
                          title="删除整组"
                        >
                          <Trash2 size={13} />
                          全删
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <CopyButton text={g.contactValue} label="复制联系" />
                          <CopyButton text={groupBatchText(g)} label="批量复制清单" />
                        </div>
                      )}
                    </header>

                    {!isCollapsed && (
                      <div className="divide-y divide-stone-100">
                        {g.items.map(it => (
                          <div key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                            {editing && (
                              <button
                                onClick={() => toggleSel(it.id)}
                                className="text-stone-700 hover:text-brand flex-shrink-0"
                                aria-label="选中"
                              >
                                {selected.has(it.id) ? <CheckSquare size={18} className="text-brand" /> : <Square size={18} />}
                              </button>
                            )}
                            {it.photoUrl ? (
                              <NextImage
                                src={it.photoUrl}
                                alt=""
                                width={56}
                                height={56}
                                sizes="56px"
                                className="h-14 w-14 object-cover rounded flex-shrink-0"
                              />
                            ) : (
                              <div className="h-14 w-14 rounded flex-shrink-0 bg-stone-100 flex items-center justify-center text-stone-300">
                                <ShoppingBag size={20} strokeWidth={1.2} />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              {/* 关闭 panel 同时跳到 ?focus=ID（主页自动展开该卡片） */}
                              <Link
                                href={`/?focus=${it.id}`}
                                onClick={onClose}
                                className="block text-sm font-medium text-stone-900 truncate hover:text-brand"
                              >
                                {it.title}
                              </Link>
                              <div className="text-brand font-bold text-sm">
                                {formatPrice(it.price, 'zh', it.itemType, it.category)}
                              </div>
                            </div>
                            {!editing && (
                              <button
                                onClick={() => removeFromCart(it.id)}
                                className="p-1.5 text-stone-400 hover:text-rose-600 flex-shrink-0"
                                title="移除"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部收起按钮 —— 跟 MyPostsPanel 一致 */}
        <div className="border-t border-stone-200 px-4 py-3 flex justify-center bg-stone-50 rounded-b-card">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-6 py-2 bg-white border border-stone-300 text-stone-700 rounded-chip hover:bg-stone-100 active:scale-95 text-sm font-medium transition-all shadow-card"
            aria-label="收起购物清单"
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
