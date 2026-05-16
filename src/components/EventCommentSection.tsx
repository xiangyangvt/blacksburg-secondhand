'use client';

// Phase 2C 黑堡 event 评论区 — EventCard 展开内嵌
//
// 行为:
//   - mount 时 fetch /api/events/[id]/comments(active 列表)
//   - 输入框:昵称(localStorage 自动填) + 内容(≤ 300)
//   - 发布 POST /api/events/[id]/comments
//   - 别人评论旁有「📨 发送我的联系方式」(打开 ContactSendModal)
//   - 自己评论旁有「删除」(soft delete)

import { useEffect, useState, useCallback } from 'react';
import { Trash2, Send } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';
import { getNickname, setNickname, subscribeNickname } from '@/lib/eventNickname';
import { ContactSendModal } from './ContactSendModal';

type Comment = {
  id: string;
  nickname: string;
  content: string;
  createdAt: string;
  isMine: boolean;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const min = diff / 60000;
  if (min < 1) return '刚刚';
  if (min < 60) return `${Math.floor(min)} 分钟前`;
  const h = min / 60;
  if (d.toDateString() === new Date().toDateString()) return `${Math.floor(h)} 小时前`;
  if (h < 36) return '昨天';
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function EventCommentSection({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [nickInput, setNickInput] = useState('');
  const [content, setContent] = useState('');
  const [sendTarget, setSendTarget] = useState<Comment | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 昵称 hydrate(localStorage)
  useEffect(() => {
    const n = getNickname();
    if (n) setNickInput(n);
    return subscribeNickname(() => {
      const updated = getNickname();
      if (updated) setNickInput(updated);
    });
  }, []);

  // load
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/comments`, { cache: 'no-store' });
      const data = await res.json();
      setComments(data.comments ?? []);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async () => {
    const nick = nickInput.trim().slice(0, 20);
    const body = content.trim().slice(0, 300);
    if (!nick) { showError('请填写昵称'); return; }
    if (!body) { showError('评论内容不能为空'); return; }

    setPosting(true);
    try {
      const res = await fetch(`/api/events/${eventId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick, content: body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showError(data.error || '发布失败');
        return;
      }
      // 持久化昵称(下次自动填)
      setNickname(nick);
      // 添加到列表底部(active asc 排序)
      setComments(prev => [...prev, { ...data.comment, isMine: true }]);
      setContent('');
      showSuccess('评论已发布');
    } catch {
      showError('网络故障,稍后再试');
    } finally {
      setPosting(false);
    }
  };

  const doDelete = async (cid: string) => {
    try {
      const res = await fetch(`/api/events/${eventId}/comments/${cid}`, { method: 'DELETE' });
      if (res.ok) {
        setComments(prev => prev.filter(c => c.id !== cid));
        showSuccess('已删除');
      } else {
        const data = await res.json().catch(() => ({}));
        showError(data.error || '删除失败');
      }
    } catch {
      showError('网络故障');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-3" data-no-toggle onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 pt-1 border-t border-stone-100">
        <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
          评论
          {!loading && comments.length > 0 && (
            <span className="ml-1 text-stone-400 normal-case">· {comments.length}</span>
          )}
        </h4>
      </div>

      {/* 评论列表 */}
      {loading ? (
        <div className="text-xs text-stone-400 py-2">加载中...</div>
      ) : comments.length === 0 ? (
        <div className="text-xs text-stone-400 py-2">
          还没有评论 · 第一个留言找搭子去吧 👀
        </div>
      ) : (
        <div className="space-y-2.5">
          {comments.map(c => (
            <div key={c.id} className="bg-stone-50 rounded-lg p-2.5 text-sm">
              <div className="flex items-center gap-2 mb-1 text-xs">
                <span className="font-medium text-stone-800">{c.nickname}</span>
                <span className="text-stone-400">{formatWhen(c.createdAt)}</span>
                {c.isMine && <span className="text-stone-400">· 我</span>}
              </div>
              <div className="text-stone-700 whitespace-pre-wrap leading-relaxed">{c.content}</div>
              {/* 操作行 */}
              <div className="flex items-center gap-2 mt-2">
                {!c.isMine && (
                  <button
                    type="button"
                    onClick={() => setSendTarget(c)}
                    className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium"
                  >
                    <Send size={12} />
                    发送我的联系方式
                  </button>
                )}
                {c.isMine && (
                  confirmDeleteId === c.id ? (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="text-stone-500">确认删除?</span>
                      <button onClick={() => doDelete(c.id)} className="text-rose-600 hover:text-rose-700 font-medium">确认</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-stone-500 hover:text-stone-700">取消</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(c.id)}
                      className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600"
                    >
                      <Trash2 size={11} />
                      删除
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 发布表单 */}
      <div className="space-y-2 pt-1">
        <div className="flex gap-2">
          <input
            type="text"
            value={nickInput}
            onChange={(e) => setNickInput(e.target.value)}
            placeholder="昵称(必填)"
            maxLength={20}
            className="w-24 sm:w-32 px-2.5 py-1.5 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
          />
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !posting) post(); }}
            placeholder="说点什么...(回车发布)"
            maxLength={300}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={post}
            disabled={posting || !content.trim() || !nickInput.trim()}
            className="px-3 py-1.5 text-sm font-medium rounded-chip bg-brand text-white hover:bg-brand-dark active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {posting ? '...' : '发布'}
          </button>
        </div>
        {content.length > 250 && (
          <div className={`text-xs ${content.length >= 300 ? 'text-rose-600' : 'text-stone-400'} text-right`}>
            {content.length} / 300
          </div>
        )}
      </div>

      {/* 联系方式 modal */}
      {sendTarget && (
        <ContactSendModal
          eventId={eventId}
          eventTitle={eventTitle}
          target={sendTarget}
          onClose={() => setSendTarget(null)}
          onSent={() => {
            setSendTarget(null);
            showSuccess('已发送你的联系方式');
          }}
        />
      )}
    </div>
  );
}
