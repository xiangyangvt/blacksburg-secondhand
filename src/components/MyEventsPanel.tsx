'use client';

// Phase 2C 我的活动 panel — 3 tab:
//   1. 我的留言     — 我在 event 下评论过的(可点跳回 event)
//   2. 我发出的联系方式 — 还没回赠的 / 已互换
//   3. 收到的联系方式   — 别人发我的(始终能看联系方式;若我也回赠则标'已互换')
//
// /localnews 头部「我的」按钮触发,跟 EventWishlistButton(心愿单)区分:
//   - 心愿单 = 收藏的活动(规划中)
//   - 我的 = 社交活动(已发生的讨论 + 联系)
//
// deep link:点活动跳 /localnews?focus=<eventId>
// 归档(Phase 2C.2 后续):endAt 过 24h → status='archived',跳 /localnews/archive/[eventId]

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, ChevronUp, MessageSquare, Send, Inbox, Check, Copy, Undo2, FileText } from 'lucide-react';
import { contactTypeLabel } from '@/lib/contactTypes';
import { showSuccess, showError } from '@/lib/toast';

type EventInfo = {
  id: string;
  title: string;
  category: string | null;
  location: string | null;
  startAt: string | null;
  endAt: string | null;
  status: string;
};

type MyComment = {
  id: string;
  content: string;
  createdAt: string;
  eventId: string;
  event: EventInfo | null;
};

type SentItem = {
  id: string;
  createdAt: string;
  eventId: string;
  matched: boolean;
  event: EventInfo | null;
  target: { id: string; nickname: string; content: string; status: string } | null;
  myContactType: string;
  myContact: string;
  myContactLabel: string | null;
};

type ReceivedItem = {
  id: string;
  createdAt: string;
  eventId: string;
  matched: boolean;
  event: EventInfo | null;
  fromNickname: string;
  fromContactType: string;
  fromContact: string;
  fromContactLabel: string | null;
  isUnread: boolean;
};

type Tab = 'posts' | 'comments' | 'sent' | 'received';

type MyPost = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  customCategory: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  scrapedAt: string;
  status: string;
  commentCount: number;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const min = diff / 60000;
  if (min < 1) return '刚刚';
  if (min < 60) return `${Math.floor(min)} 分钟前`;
  const h = min / 60;
  if (h < 24) return `${Math.floor(h)} 小时前`;
  if (h < 48) return '昨天';
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function deepLink(eventId: string): string {
  return `/localnews?focus=${eventId}`;
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // fallback for older browsers / non-https
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showSuccess('已复制');
  } catch {
    showError('复制失败,请手动选中复制');
  }
}

/**
 * MyEventsContent — 可嵌入的内容(tab 行 + 加载 + 4 段列表)
 * 不含 modal 外壳,方便 MyPostsPanel 在 platform='event' 里复用
 *
 * 在独立 MyEventsPanel 里(下面那个) 包了 portal + modal shell
 * 在 MyPostsPanel 里直接 render <MyEventsContent /> 不重复 modal
 */
export function MyEventsContent({
  initialTab = 'posts', onItemClick,
}: {
  initialTab?: Tab;
  onItemClick?: () => void;  // 点 event link 时回调(modal 用来关闭自己)
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [comments, setComments] = useState<MyComment[]>([]);
  const [sent, setSent] = useState<SentItem[]>([]);
  const [received, setReceived] = useState<ReceivedItem[]>([]);
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch('/api/my/events', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { comments: [], sent: [], received: [], posts: [] })
      .then(d => {
        if (cancel) return;
        setComments(d.comments ?? []);
        setSent(d.sent ?? []);
        setReceived(d.received ?? []);
        setPosts(d.posts ?? []);
      })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, []);

  // 撤回 sent
  const revokeSent = async (item: SentItem) => {
    try {
      const res = await fetch(
        `/api/events/${item.eventId}/contact-send/${item.id}`,
        { method: 'DELETE' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showError(data.error || '撤回失败');
        return;
      }
      setSent(prev => prev.filter(s => s.id !== item.id));
      showSuccess('已撤回');
    } catch {
      showError('网络故障');
    }
  };

  const unreadCount = useMemo(() => received.filter(r => r.isUnread).length, [received]);
  const close = onItemClick ?? (() => {});

  return (
    <div>
      {/* tab 行 — 4 tab:我发的活动 / 留言 / 已发出 / 已收到 */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-stone-200 mb-3">
        <TabButton active={tab === 'posts'}    onClick={() => setTab('posts')}    icon={<FileText size={14} />}       label="我发的活动" count={posts.length} />
        <TabButton active={tab === 'comments'} onClick={() => setTab('comments')} icon={<MessageSquare size={14} />}  label="留言" count={comments.length} />
        <TabButton active={tab === 'sent'}     onClick={() => setTab('sent')}     icon={<Send size={14} />}           label="已发出" count={sent.length} />
        <TabButton active={tab === 'received'} onClick={() => setTab('received')} icon={<Inbox size={14} />}          label="已收到" count={received.length} badge={unreadCount} />
      </div>

      <div className="min-h-[200px]">
        {loading ? (
          <div className="text-center text-stone-400 py-12 text-sm">加载中...</div>
        ) : tab === 'posts' ? (
          <PostsList items={posts} onClose={close} />
        ) : tab === 'comments' ? (
          <CommentsList items={comments} onClose={close} />
        ) : tab === 'sent' ? (
          <SentList items={sent} onClose={close} onRevoke={revokeSent} />
        ) : (
          <ReceivedList items={received} onClose={close} />
        )}
      </div>
    </div>
  );
}

/**
 * MyEventsPanel — 独立 modal 版本(/localnews 之前用,Phase 3A.2 已替换为 MyPostsPanel)
 * 保留兼容性,可能后续 deprecate
 */
export function MyEventsPanel({
  onClose, initialTab = 'posts',
}: {
  onClose: () => void;
  initialTab?: Tab;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

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
          <h2 className="text-lg font-semibold text-stone-900">我的</h2>
          <button
            onClick={onClose}
            className="ml-auto text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100"
            aria-label="关闭"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-3 sm:p-4">
          <MyEventsContent initialTab={initialTab} onItemClick={onClose} />
        </div>

        {/* 底部收起 */}
        <div className="border-t border-stone-200 px-4 py-3 flex justify-center bg-stone-50 rounded-b-card">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-6 py-2 bg-white border border-stone-300 text-stone-700 rounded-chip hover:bg-stone-100 active:scale-95 text-sm font-medium transition-all shadow-card"
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

function TabButton({
  active, onClick, icon, label, count, badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'text-brand border-brand'
          : 'text-stone-600 border-transparent hover:text-stone-900'
      }`}
    >
      {icon}
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="text-stone-400 text-xs font-normal">· {count}</span>
      )}
      {badge && badge > 0 && (
        <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center" aria-hidden>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function EventCardLink({ ev, onClose }: { ev: EventInfo | null; onClose: () => void }) {
  if (!ev) return <span className="text-xs text-stone-400 italic">活动已下架</span>;
  return (
    <Link
      href={deepLink(ev.id)}
      onClick={onClose}
      className="block text-sm font-medium text-stone-900 hover:text-brand truncate"
    >
      {ev.title}
    </Link>
  );
}

function CommentsList({ items, onClose }: { items: MyComment[]; onClose: () => void }) {
  if (items.length === 0) {
    return <EmptyHint icon={<MessageSquare size={40} />} text="还没发过评论" hint="在 event 卡片展开后留言找搭子" />;
  }
  return (
    <div className="space-y-2">
      {items.map(c => (
        <div key={c.id} className="bg-white rounded-card border border-stone-200 p-3">
          <EventCardLink ev={c.event} onClose={onClose} />
          <div className="text-sm text-stone-700 mt-1 line-clamp-2 whitespace-pre-wrap">{c.content}</div>
          <div className="text-xs text-stone-400 mt-1">{formatWhen(c.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

function SentList({
  items, onClose, onRevoke,
}: {
  items: SentItem[];
  onClose: () => void;
  onRevoke: (item: SentItem) => Promise<void> | void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (items.length === 0) {
    return <EmptyHint icon={<Send size={40} />} text="还没发过联系方式" hint="想跟谁一起去时,点 TA 评论上的「发送我的联系方式」" />;
  }
  return (
    <div className="space-y-2">
      {items.map(s => (
        <div key={s.id} className="bg-white rounded-card border border-stone-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <EventCardLink ev={s.event} onClose={onClose} />
            {s.matched && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <Check size={12} />
                已互换
              </span>
            )}
          </div>
          <div className="text-xs text-stone-500">
            发给 <span className="font-medium text-stone-700">{s.target?.nickname ?? '(评论已删除)'}</span>
            {s.target && <span className="text-stone-400"> · 「{s.target.content.slice(0, 30)}{s.target.content.length > 30 ? '...' : ''}」</span>}
          </div>
          <div className="text-xs text-stone-500 mt-1">
            你发了:{contactTypeLabel(s.myContactType, s.myContactLabel)} · <span className="font-mono text-stone-700">{s.myContact}</span>
          </div>
          <div className="text-xs text-stone-400 mt-1 flex items-center gap-2 flex-wrap">
            <span>{formatWhen(s.createdAt)}</span>
            {!s.matched && <span className="text-stone-400">· 等待 TA 回赠</span>}
            {/* 撤回按钮 — 二步确认避免误删 */}
            <span className="ml-auto">
              {confirmId === s.id ? (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className="text-stone-500">确认撤回?</span>
                  <button
                    onClick={async () => { await onRevoke(s); setConfirmId(null); }}
                    className="text-rose-600 hover:text-rose-700 font-medium"
                  >确认</button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="text-stone-500 hover:text-stone-700"
                  >取消</button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmId(s.id)}
                  className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-rose-600"
                  title="撤回:对方下次打开「我的」时就看不到了"
                >
                  <Undo2 size={11} />
                  撤回
                </button>
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReceivedList({ items, onClose }: { items: ReceivedItem[]; onClose: () => void }) {
  if (items.length === 0) {
    return <EmptyHint icon={<Inbox size={40} />} text="还没收到联系方式" hint="发了评论后,如果有人想找你一起去,你会在这里看到他们" />;
  }
  return (
    <div className="space-y-2">
      {items.map(r => (
        <div key={r.id} className={`bg-white rounded-card border p-3 ${r.isUnread ? 'border-brand/40 bg-brand/5' : 'border-stone-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <EventCardLink ev={r.event} onClose={onClose} />
            {r.matched && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <Check size={12} />
                已互换
              </span>
            )}
          </div>
          <div className="text-xs text-stone-600 mb-1">
            <span className="font-medium text-stone-800">{r.fromNickname}</span> 想跟你一起去
          </div>
          <div className="text-sm bg-stone-50 rounded-lg p-2 mt-1 border border-stone-200 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-stone-500 mb-0.5">{contactTypeLabel(r.fromContactType, r.fromContactLabel)}</div>
              <div className="font-mono text-stone-900 break-all">{r.fromContact}</div>
            </div>
            <button
              type="button"
              onClick={() => copyText(r.fromContact)}
              className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-chip bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 active:scale-95 transition-all"
              title="复制联系方式"
            >
              <Copy size={12} />
              复制
            </button>
          </div>
          <div className="text-xs text-stone-400 mt-1.5 flex items-center gap-2">
            <span>{formatWhen(r.createdAt)}</span>
            {!r.matched && <span>· 也想去的话,可以回赠你的联系方式</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// === Phase 3A 我发的活动 list ===
const CATEGORY_LABEL_SHORT: Record<string, string> = {
  life: '生活',
  exercise: '运动',
  academic: '学术',
  competition: '比赛',
  discussion: '讨论',
  other: '其他',
};

function PostsList({ items, onClose }: { items: MyPost[]; onClose: () => void }) {
  if (items.length === 0) {
    return <EmptyHint icon={<FileText size={40} />} text="还没发过活动" hint="在 /localnews 顶部点「+ 发布」分享给社区" />;
  }
  return (
    <div className="space-y-2">
      {items.map(p => {
        const catLabel = p.category === 'other'
          ? (p.customCategory || '其他')
          : (CATEGORY_LABEL_SHORT[p.category ?? ''] ?? '活动');
        return (
          <div key={p.id} className="bg-white rounded-card border border-stone-200 p-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-brand">
                {catLabel}
              </span>
              <Link
                href={`/localnews?focus=${p.id}`}
                onClick={onClose}
                className="flex-1 min-w-0 text-sm font-medium text-stone-900 hover:text-brand truncate"
              >
                {p.title}
              </Link>
            </div>
            {p.description && (
              <div className="text-xs text-stone-600 line-clamp-2 mt-1">{p.description}</div>
            )}
            <div className="flex items-center gap-3 text-xs text-stone-400 mt-1.5 flex-wrap">
              <span>{formatWhen(p.scrapedAt)}发布</span>
              {p.commentCount > 0 && <span>· {p.commentCount} 条评论</span>}
              {p.location && <span className="truncate">· {p.location}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyHint({ icon, text, hint }: { icon: React.ReactNode; text: string; hint?: string }) {
  return (
    <div className="text-center text-stone-500 py-12 bg-white rounded-lg border border-stone-200">
      <div className="text-stone-300 mb-3 flex justify-center">{icon}</div>
      <div className="mb-1.5 text-sm">{text}</div>
      {hint && <div className="text-xs text-stone-400 px-4">{hint}</div>}
    </div>
  );
}
