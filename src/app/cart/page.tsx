'use client';

// 购物清单页 —— 按卖家联系方式分组的批量购物列表
// 设计目标：方便买家一次性约同一卖家买多件、批量复制清单文本发给卖家
//
// 数据：localStorage（client-only），跟服务端无关
// 同步：mount 时拉一次最新 items，syncCart 更新 snapshot；找不到的 id 静默移除（已下架）

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import NextImage from 'next/image';
import { ArrowLeft, Pencil, X, Trash2, CheckSquare, Square, ChevronDown, ChevronRight, ShoppingBag } from 'lucide-react';
import {
  getCart, removeFromCart, removeMany, syncCart, subscribeCart, type CartItem,
} from '@/lib/shoppingCart';
import { contactTypeLabel, formatPrice, itemCopyText } from '@/lib/utils';
import { CopyButton } from '@/components/CopyButton';

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // contactValue 集合

  useEffect(() => {
    setMounted(true);
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

  // 把整组组装成"标题 — $价格"列表文本（发给卖家用）
  const groupBatchText = (group: { contactValue: string; items: CartItem[] }) => {
    const lines = group.items.map(i => `· ${itemCopyText(i.title, i.price, i.itemType, i.category)}`);
    return `你好，我想买你发布的这几件：\n${lines.join('\n')}`;
  };

  if (!mounted) {
    return <main className="min-h-screen bg-stone-50" />;
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-brand whitespace-nowrap">
            <ArrowLeft size={16} />
            <span>回二手</span>
          </Link>
          <h1 className="text-base font-bold text-stone-900 ml-auto inline-flex items-center gap-1.5">
            <ShoppingBag size={18} className="text-brand" />
            购物清单 {cart.length > 0 && <span className="text-stone-500">· {cart.length} 件</span>}
          </h1>
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
        </div>

        {/* 编辑模式 sticky 操作条 */}
        {editing && (
          <div className="bg-stone-900 text-white px-4 py-2 text-sm flex items-center justify-between">
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
      </header>

      <div className="max-w-3xl mx-auto px-3 md:px-4 py-4">
        {cart.length === 0 ? (
          <div className="text-center text-stone-500 py-20 bg-white rounded-card border border-stone-200">
            <ShoppingBag size={56} strokeWidth={1.2} className="mx-auto mb-4 text-stone-300" />
            <div className="mb-3">购物清单是空的</div>
            <Link href="/" className="text-brand underline hover:text-brand-dark">
              去二手挑挑看 →
            </Link>
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
                  {/* 组 header */}
                  <header className="flex items-center gap-2 px-3 py-2.5 bg-stone-50 border-b border-stone-200">
                    {editing && (
                      <button
                        onClick={() => toggleGroupSel(g)}
                        className="text-stone-700 hover:text-brand"
                        aria-label="选中整组"
                      >
                        {allSel ? <CheckSquare size={18} className="text-brand" /> : someSel ? <CheckSquare size={18} className="text-brand opacity-50" /> : <Square size={18} />}
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

                  {/* 组内物品 */}
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
                            <Link
                              href={`/?focus=${it.id}`}
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
    </main>
  );
}
