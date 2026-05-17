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
import {
  X, ChevronUp, ChevronDown, MessageSquare, Send, Inbox, Check, Copy, Undo2, FileText,
  CheckCircle2, XCircle, Hourglass, Users, UserPlus, RefreshCw, MapPin,
} from 'lucide-react';
import { contactTypeLabel, CONTACT_TYPES, type ContactType } from '@/lib/contactTypes';
import { showSuccess, showError } from '@/lib/toast';
import {
  getNickname, setNickname as persistNickname,
  getLastContact, setLastContact,
} from '@/lib/eventNickname';
import { EditCodePrompt } from './EditCodePrompt';
import { EventPostModal, type EventPostInitial } from './EventPostModal';

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
  note?: string | null;          // Phase 3B 一行话备注
  status?: string;               // Phase 3B: active | canceled | archived
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
  note?: string | null;          // Phase 3B
  isUnread: boolean;
};

type Tab = 'posts' | 'comments' | 'sent' | 'received';

// Phase 3B: 响应者(我发起的活动下,别人发我联系方式)
type Responder = {
  id: string;
  nickname: string;
  note: string | null;
  contactType: string;
  contact: string;
  contactLabel: string | null;
  status: string;       // active | canceled | archived
  revealed: boolean;    // 我(poster)是否已回赠
  createdAt: string;
};

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
  status: string;       // active | fulfilled | canceled | expired | hidden | deleted
  commentCount: number;
  maxAttendees?: number | null;
  photoUrls?: string[];
  responders?: Responder[];      // Phase 3B
  responseCount?: number;
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
  initialTab = 'posts', onItemClick, contact,
}: {
  initialTab?: Tab;
  onItemClick?: () => void;  // 点 event link 时回调(modal 用来关闭自己)
  contact?: string;          // Phase 2B+: 可选,soft-login contact — 找回 cross-device 内容
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [comments, setComments] = useState<MyComment[]>([]);
  const [sent, setSent] = useState<SentItem[]>([]);
  const [received, setReceived] = useState<ReceivedItem[]>([]);
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick(t => t + 1);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const url = contact
      ? `/api/my/events?contact=${encodeURIComponent(contact)}`
      : '/api/my/events';
    fetch(url, { cache: 'no-store' })
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
  }, [contact, refreshTick]);

  // Phase 3B: soft cancel(PATCH 而非 DELETE)
  const revokeSent = async (item: SentItem) => {
    try {
      const res = await fetch(
        `/api/events/${item.eventId}/contact-send/${item.id}`,
        { method: 'PATCH' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showError(data.error || '撤回失败');
        return;
      }
      // 不再 filter — soft cancel,sent 数组里要保留显示"已撤回"
      setSent(prev => prev.map(s => s.id === item.id ? { ...s, status: 'canceled' } : s));
      showSuccess('已撤回');
    } catch {
      showError('网络故障');
    }
  };

  const unreadCount = useMemo(() => received.filter(r => r.isUnread).length, [received]);
  const close = onItemClick ?? (() => {});

  return (
    <div>
      {/* tab 行 — 4 tab,跟 MyPostsPanel(找室友)同款样式:label (count) 括号 + 选中加粗
          label 简短(不带"活动")避免换行 */}
      <div className="flex gap-0 overflow-x-auto no-scrollbar border-b border-stone-200 mb-3">
        <TabButton active={tab === 'posts'}    onClick={() => setTab('posts')}    icon={<FileText size={14} />}       label="我发的" count={posts.length} />
        <TabButton active={tab === 'comments'} onClick={() => setTab('comments')} icon={<MessageSquare size={14} />}  label="留言" count={comments.length} />
        <TabButton active={tab === 'sent'}     onClick={() => setTab('sent')}     icon={<Send size={14} />}           label="已发出" count={sent.length} />
        <TabButton active={tab === 'received'} onClick={() => setTab('received')} icon={<Inbox size={14} />}          label="已收到" count={received.length} badge={unreadCount} />
      </div>

      <div className="min-h-[200px]">
        {loading ? (
          <div className="text-center text-stone-400 py-12 text-sm">加载中...</div>
        ) : tab === 'posts' ? (
          <PostsList items={posts} onClose={close} onRefresh={refresh} />
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
  // 跟 MyPostsPanel.TabBtn 同款:括号包数量、选中加粗 + 红字 + 下划线、whitespace-nowrap 防换行
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-1 px-4 py-2 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
        active
          ? 'border-brand text-brand font-semibold'
          : 'border-transparent text-stone-500 hover:text-stone-800'
      }`}
    >
      {icon}
      <span>{label}{typeof count === 'number' ? ` (${count})` : ''}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-1 right-0 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
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
      {items.map(s => {
        const isCanceled = s.status === 'canceled';
        return (
          <div
            key={s.id}
            className={`rounded-card border p-3 ${
              isCanceled ? 'bg-stone-50 border-stone-200 opacity-80' : 'bg-white border-stone-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <EventCardLink ev={s.event} onClose={onClose} />
              {/* Phase 3B 状态 chip(active=绿;canceled=灰) */}
              {isCanceled ? (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-stone-100 text-stone-500 border border-stone-200">
                  <Undo2 size={11} />
                  已撤回
                </span>
              ) : (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Check size={11} />
                  已发送
                </span>
              )}
              {s.matched && !isCanceled && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <Check size={12} />
                  已互换
                </span>
              )}
            </div>
            {s.target && (
              <div className="text-xs text-stone-500">
                发给 <span className="font-medium text-stone-700">{s.target.nickname}</span>
                <span className="text-stone-400"> · 「{s.target.content.slice(0, 30)}{s.target.content.length > 30 ? '...' : ''}」</span>
              </div>
            )}
            {!s.target && (
              <div className="text-xs text-stone-500">发给活动发起人</div>
            )}
            {/* Phase 3B note — 一行话备注 */}
            {s.note && (
              <div className="text-xs text-stone-600 mt-1 italic">「{s.note}」</div>
            )}
            <div className="text-xs text-stone-500 mt-1">
              你发了:{contactTypeLabel(s.myContactType, s.myContactLabel)} · <span className="font-mono text-stone-700">{s.myContact}</span>
            </div>
            <div className="text-xs text-stone-400 mt-1 flex items-center gap-2 flex-wrap">
              <span>{formatWhen(s.createdAt)}</span>
              {!s.matched && !isCanceled && <span className="text-stone-400">· 等待 TA 回赠</span>}
              {/* 撤回按钮 — 二步确认避免误删,canceled 状态不显 */}
              {!isCanceled && (
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
              )}
            </div>
          </div>
        );
      })}
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
          {r.note && (
            <div className="text-xs text-stone-600 mb-1 italic">「{r.note}」</div>
          )}
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

// Phase 3B: 状态 badge(active 不显示)
const STATUS_META: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  fulfilled: { label: '已结清', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  canceled:  { label: '已取消', cls: 'bg-rose-50 text-rose-700 border-rose-200',           Icon: XCircle },
  expired:   { label: '已过期', cls: 'bg-stone-100 text-stone-500 border-stone-200',       Icon: Hourglass },
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
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
    return true;
  } catch {
    return false;
  }
}

function PostsList({
  items, onClose, onRefresh,
}: {
  items: MyPost[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 操作弹窗 — 一次只可能开一个
  const [codePrompt, setCodePrompt] = useState<{
    post: MyPost;
    nextStatus: 'fulfilled' | 'canceled';
    label: string;
  } | null>(null);
  // "再发一次"弹窗 — 用 EventPostModal 编辑
  const [repostInitial, setRepostInitial] = useState<EventPostInitial | null>(null);

  if (items.length === 0) {
    return <EmptyHint icon={<FileText size={40} />} text="还没发过活动" hint="在 /localnews 顶部点「+ 发布」分享给社区" />;
  }

  const onChangeStatus = async (post: MyPost, code: string, nextStatus: 'fulfilled' | 'canceled') => {
    try {
      const res = await fetch(`/api/events/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showError(data.error || '操作失败');
        return;
      }
      showSuccess(nextStatus === 'fulfilled' ? '已标记为已结清' : '已取消活动');
      setCodePrompt(null);
      onRefresh();
    } catch {
      showError('网络故障');
    }
  };

  const onRepost = (p: MyPost) => {
    // Sprint 7 fix: "再发一次" 改走 POST 新建 event(forceNew),不再 PATCH 原 event
    // 这样原活动的状态/响应历史保留,新发布是真新条目 — 用户预期符合"再发一次"语义
    // 把 startAt/endAt 各 +7 天(若有)作为默认值
    const shift7d = (iso: string | null): string | null => {
      if (!iso) return null;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      d.setDate(d.getDate() + 7);
      return d.toISOString();
    };
    setRepostInitial({
      id: p.id,
      title: p.title,
      category: p.category ?? 'life',
      customCategory: p.customCategory ?? null,
      description: p.description ?? '',
      startAt: shift7d(p.startAt),
      endAt: shift7d(p.endAt),
      location: p.location,
      posterNickname: '',     // 让 EventPostModal 自己 hydrate(走 create 路径)
      posterContactType: null,
      posterContact: null,
      posterContactLabel: null,
      posterContactPublic: false,
      maxAttendees: p.maxAttendees ?? null,
    });
  };

  const onCopyAllPublic = async (p: MyPost) => {
    const revealed = (p.responders ?? []).filter(r => r.revealed && r.status !== 'canceled');
    if (revealed.length === 0) {
      showError('还没有已公开联系方式的响应者');
      return;
    }
    const text = revealed.map(r =>
      `${r.nickname} · ${contactTypeLabel(r.contactType, r.contactLabel)}: ${r.contact}`,
    ).join('\n');
    const ok = await copyToClipboard(text);
    if (ok) showSuccess(`已复制 ${revealed.length} 条联系方式`);
    else showError('复制失败,请手动选中复制');
  };

  return (
    <div className="space-y-2">
      {items.map(p => {
        const catLabel = p.category === 'other'
          ? (p.customCategory || '其他')
          : (CATEGORY_LABEL_SHORT[p.category ?? ''] ?? '活动');
        const isExpanded = expandedId === p.id;
        const isActive = p.status === 'active' || !p.status;
        const statusMeta = !isActive ? STATUS_META[p.status] ?? null : null;
        const responders = p.responders ?? [];
        const respCount = p.responseCount ?? responders.filter(r => r.status !== 'canceled').length;
        const wanted = p.maxAttendees;
        return (
          <div key={p.id} className="bg-white rounded-card border border-stone-200 overflow-hidden">
            {/* 头部 — 永远显示(点 toggle expand) */}
            <button
              type="button"
              onClick={() => setExpandedId(prev => prev === p.id ? null : p.id)}
              className="w-full text-left p-3 hover:bg-stone-50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-brand">
                  {catLabel}
                </span>
                {statusMeta && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusMeta.cls}`}>
                    <statusMeta.Icon size={11} strokeWidth={2.2} />
                    {statusMeta.label}
                  </span>
                )}
                {/* 响应数 chip */}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-stone-100 text-stone-700">
                  <Users size={11} strokeWidth={2.2} />
                  {wanted ? `想找 ${wanted} · 已 ${respCount} 响应` : `已 ${respCount} 响应`}
                </span>
                <span className="ml-auto text-stone-400">
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </div>
              <div className="text-sm font-medium text-stone-900 truncate">{p.title}</div>
              {!isExpanded && p.description && (
                <div className="text-xs text-stone-600 line-clamp-2 mt-1">{p.description}</div>
              )}
              <div className="flex items-center gap-2 text-xs text-stone-400 mt-1.5 flex-wrap">
                <span>{formatWhen(p.scrapedAt)}发布</span>
                {p.commentCount > 0 && <span>· {p.commentCount} 条评论</span>}
                {p.location && (
                  <span className="inline-flex items-center gap-1 truncate">
                    · <MapPin size={11} />{p.location}
                  </span>
                )}
              </div>
            </button>

            {/* 展开 — 响应者列表 + 操作按钮 */}
            {isExpanded && (
              <div className="border-t border-stone-100 px-3 py-3 space-y-3">
                {/* 跳详情 link */}
                <div>
                  <Link
                    href={`/localnews?focus=${p.id}`}
                    onClick={onClose}
                    className="text-xs text-brand hover:text-brand-dark underline"
                  >
                    查看活动详情 →
                  </Link>
                </div>

                {p.description && (
                  <div className="text-xs text-stone-700 whitespace-pre-wrap leading-relaxed">{p.description}</div>
                )}

                {/* 响应者列表 */}
                <ResponderList
                  postId={p.id}
                  responders={responders}
                  onAfterReveal={onRefresh}
                />

                {/* 顶层操作按钮 */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isActive && (
                    <>
                      <button
                        onClick={() => setCodePrompt({ post: p, nextStatus: 'fulfilled', label: '标记已结清' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-card"
                      >
                        <CheckCircle2 size={13} />
                        标记已结清
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm('确定取消活动?对方还能看到「已取消」状态。')) return;
                          setCodePrompt({ post: p, nextStatus: 'canceled', label: '取消活动' });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium bg-white border border-stone-300 text-rose-600 hover:bg-rose-50 active:scale-95 transition-all"
                      >
                        <XCircle size={13} />
                        取消活动
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => onRepost(p)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 active:scale-95 transition-all"
                  >
                    <RefreshCw size={13} />
                    再发一次
                  </button>
                  {isActive && responders.some(r => r.revealed && r.status !== 'canceled') && (
                    <button
                      onClick={() => onCopyAllPublic(p)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 active:scale-95 transition-all"
                    >
                      <Copy size={13} />
                      复制所有公开联系方式
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 改状态 — 密码弹窗 */}
      {codePrompt && (
        <EditCodePrompt
          itemId={codePrompt.post.id}
          title={codePrompt.post.title}
          action={codePrompt.label}
          onCancel={() => setCodePrompt(null)}
          onConfirm={async (code) => {
            await onChangeStatus(codePrompt.post, code, codePrompt.nextStatus);
          }}
        />
      )}

      {/* 再发一次 — Sprint 7:复用 EventPostModal,但走 forceNew 路径 (POST 新建 event)
          预填字段从 initial 来,submit 走 POST。原 event 状态/响应历史不动。 */}
      {repostInitial && (
        <EventPostModal
          initial={repostInitial}
          forceNew
          onClose={() => setRepostInitial(null)}
          onCreated={() => { setRepostInitial(null); onRefresh(); }}
        />
      )}
    </div>
  );
}

// Phase 3B 响应者列表 — poster 视角看到的"谁想跟我一起"
function ResponderList({
  postId, responders, onAfterReveal,
}: {
  postId: string;
  responders: Responder[];
  onAfterReveal: () => void;
}) {
  // 按 createdAt 倒序
  const sorted = useMemo(
    () => [...responders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [responders],
  );
  const [revealId, setRevealId] = useState<string | null>(null);

  if (sorted.length === 0) {
    return (
      <div className="text-xs text-stone-400 bg-stone-50 rounded-lg border border-stone-200 py-4 text-center">
        还没人响应,耐心等等
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-stone-700">
        响应者({sorted.filter(r => r.status !== 'canceled').length})
      </div>
      {sorted.map(r => (
        <ResponderRow
          key={r.id}
          postId={postId}
          responder={r}
          openReveal={revealId === r.id}
          onOpenReveal={() => setRevealId(r.id)}
          onCloseReveal={() => setRevealId(null)}
          onAfterReveal={() => { setRevealId(null); onAfterReveal(); }}
        />
      ))}
    </div>
  );
}

function ResponderRow({
  postId, responder, openReveal, onOpenReveal, onCloseReveal, onAfterReveal,
}: {
  postId: string;
  responder: Responder;
  openReveal: boolean;
  onOpenReveal: () => void;
  onCloseReveal: () => void;
  onAfterReveal: () => void;
}) {
  const r = responder;
  const isCanceled = r.status === 'canceled';

  if (isCanceled) {
    return (
      <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-400">
        <span className="font-medium">{r.nickname}</span> · 对方撤回了
        <span className="ml-2 text-stone-300">{formatWhen(r.createdAt)}</span>
      </div>
    );
  }

  if (r.revealed) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-stone-900">{r.nickname}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
            <Check size={11} />已回赠
          </span>
          <span className="ml-auto text-[11px] text-stone-400">{formatWhen(r.createdAt)}</span>
        </div>
        {r.note && <div className="text-xs text-stone-600 mb-1 italic">「{r.note}」</div>}
        <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-md px-2 py-1.5">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-stone-500">{contactTypeLabel(r.contactType, r.contactLabel)}</div>
            <div className="font-mono text-sm text-stone-900 break-all">{r.contact}</div>
          </div>
          <button
            onClick={() => copyText(r.contact)}
            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-chip bg-stone-100 border border-stone-300 text-stone-700 hover:bg-stone-200 active:scale-95 transition-all"
            title="复制联系方式"
          >
            <Copy size={11} />
            复制
          </button>
        </div>
      </div>
    );
  }

  // active + 未 reveal — 显示昵称 + note + 按钮"公开我联系方式给 ta"
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-2.5">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-sm font-medium text-stone-900">{r.nickname}</span>
        <span className="text-[11px] text-stone-400">想跟你一起去</span>
        <span className="ml-auto text-[11px] text-stone-400">{formatWhen(r.createdAt)}</span>
      </div>
      {r.note && <div className="text-xs text-stone-600 mb-2 italic">「{r.note}」</div>}
      {openReveal ? (
        <RevealForm
          postId={postId}
          responderSendId={r.id}
          onCancel={onCloseReveal}
          onSuccess={onAfterReveal}
        />
      ) : (
        <button
          onClick={onOpenReveal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-xs font-medium bg-brand text-white hover:bg-brand-dark active:scale-95 transition-all shadow-card"
        >
          <UserPlus size={12} />
          公开我联系方式给 ta
        </button>
      )}
    </div>
  );
}

function RevealForm({
  postId, responderSendId, onCancel, onSuccess,
}: {
  postId: string;
  responderSendId: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [nickname, setNick] = useState('');
  const [contactType, setContactType] = useState<ContactType>('wechat');
  const [contact, setContact] = useState('');
  const [contactLabel, setContactLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // hydrate
  useEffect(() => {
    const n = getNickname();
    if (n) setNick(n);
    const last = getLastContact();
    if (last) {
      setContactType(last.contactType);
      setContact(last.contact);
      if (last.contactLabel) setContactLabel(last.contactLabel);
    }
  }, []);

  const submit = async () => {
    const n = nickname.trim();
    const c = contact.trim();
    if (!n) return showError('请填写昵称');
    if (!c) return showError('请填写联系方式');
    if (contactType === 'other' && !contactLabel.trim()) {
      return showError('请填写「其他」联系方式平台名');
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${postId}/reveal-to-responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responderSendId,
          nickname: n,
          contactType,
          contact: c,
          contactLabel: contactType === 'other' ? contactLabel.trim() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showError(data.error || '回赠失败');
        return;
      }
      persistNickname(n);
      setLastContact({
        contactType,
        contact: c,
        contactLabel: contactType === 'other' ? contactLabel.trim() : undefined,
      });
      showSuccess('已回赠你的联系方式');
      onSuccess();
    } catch {
      showError('网络故障');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 bg-stone-50 rounded-md p-2 border border-stone-200">
      <input
        type="text"
        value={nickname}
        onChange={(e) => setNick(e.target.value)}
        maxLength={20}
        placeholder="你的昵称(对方看得到)"
        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded focus:outline-none focus:border-brand"
      />
      <div className="flex gap-1.5">
        <select
          value={contactType}
          onChange={(e) => setContactType(e.target.value as ContactType)}
          className="px-2 py-1.5 text-xs bg-white border border-stone-300 rounded focus:outline-none focus:border-brand"
        >
          {CONTACT_TYPES.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={CONTACT_TYPES.find(t => t.id === contactType)?.placeholder}
          maxLength={80}
          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded focus:outline-none focus:border-brand"
        />
      </div>
      {contactType === 'other' && (
        <input
          type="text"
          value={contactLabel}
          onChange={(e) => setContactLabel(e.target.value)}
          placeholder="平台名(如 Line)"
          maxLength={20}
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded focus:outline-none focus:border-brand"
        />
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={submit}
          disabled={submitting}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brand text-white rounded-chip hover:bg-brand-dark active:scale-95 disabled:opacity-50 transition-all shadow-card"
        >
          <Check size={12} />
          {submitting ? '...' : '回赠'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-stone-600 rounded-chip hover:bg-stone-100 transition-colors"
        >
          取消
        </button>
      </div>
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
