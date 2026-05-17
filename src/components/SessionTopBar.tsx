'use client';

// 简洁的登录横条 —— 嵌在三个发布 modal 顶部 sticky header 下方
//
// 状态:
// - 未登录:[input email + "发送登录链接" 按钮] 横条;成功后 toast 提示查收邮件
// - 已登录:"已登录 {email}" + "退出"
//
// 不强制登录(spec 明确仍保留识别码方案);仅做识别 + 预填字段方便用户。

import { useEffect, useState } from 'react';
import { showSuccess, showError } from '@/lib/toast';

type SessionData = {
  email: string;
  nickname: string | null;
  contactValue: string | null;
  contactType: string | null;
} | null;

export function SessionTopBar({
  onSessionChange,
}: {
  /** session 状态变化通知父组件,父组件可借此预填字段 */
  onSessionChange?: (s: SessionData) => void;
} = {}) {
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<SessionData>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((data: { session: SessionData }) => {
        if (cancelled) return;
        setSession(data.session ?? null);
        setLoaded(true);
        onSessionChange?.(data.session ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitEmail = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const v = email.trim();
    if (!v) return showError('请输入邮箱');
    setSending(true);
    try {
      const res = await fetch('/api/auth/magic-link/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: v }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || '发送失败');
        return;
      }
      setSent(true);
      showSuccess('已发送,请查收邮件');
    } catch {
      showError('网络故障,稍后再试');
    } finally {
      setSending(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setSession(null);
    setEmail('');
    setSent(false);
    onSessionChange?.(null);
  };

  if (!loaded) {
    return (
      <div className="bg-stone-50 border-b border-stone-200 px-5 py-2 text-xs text-stone-400">
        加载中…
      </div>
    );
  }

  if (session) {
    return (
      <div className="bg-stone-50 border-b border-stone-200 px-5 py-2 flex items-center gap-2 text-xs">
        <span className="text-stone-600">已登录</span>
        <span className="text-stone-900 font-medium truncate">{session.email}</span>
        <button
          type="button"
          onClick={logout}
          className="ml-auto text-stone-500 hover:text-stone-900 underline"
        >
          退出
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submitEmail}
      className="bg-stone-50 border-b border-stone-200 px-5 py-2 flex items-center gap-2"
    >
      <span className="text-xs text-stone-600 hidden sm:inline">登录(可选)</span>
      <input
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setSent(false); }}
        placeholder="邮箱"
        disabled={sending || sent}
        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand disabled:bg-stone-100"
      />
      <button
        type="submit"
        disabled={sending || sent || !email.trim()}
        className="px-3 py-1.5 text-xs font-medium bg-brand text-white rounded-md hover:bg-brand-dark disabled:opacity-50 flex-shrink-0"
      >
        {sent ? '已发送' : sending ? '发送中…' : '发送登录链接'}
      </button>
    </form>
  );
}
