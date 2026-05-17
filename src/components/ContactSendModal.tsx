'use client';

// Phase 2C 联系方式发送 modal
//
// 用户点某条评论的「发送我的联系方式」按钮后弹出此 modal
// 输入:昵称(localStorage 自动填) + 联系方式类型 + 联系方式 + (other 时)label
// 提交 POST /api/events/[id]/contact-send
//
// UX 设计要点(Sean 指导):
//   - 不是「请求对方联系方式」是「主动给出我的」
//   - 受方将立即收到这条信息;TA 是否回赠完全独立(单向)
//   - 副本提示「TA 可能没看到」让 sender 别太期待

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send } from 'lucide-react';
import { showError } from '@/lib/toast';
import { CONTACT_TYPES, validateContactInput, type ContactType } from '@/lib/contactTypes';
import { getNickname, setNickname, getLastContact, setLastContact } from '@/lib/eventNickname';

type Target = {
  id: string | null;   // 评论 id;null = 发给 event poster(用户发布的活动)
  nickname: string;
  content: string;     // 上下文(评论文 或 event 标题)
};

export function ContactSendModal({
  eventId, eventTitle, target, onClose, onSent,
}: {
  eventId: string;
  eventTitle: string;
  target: Target;
  onClose: () => void;
  onSent: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [nick, setNick] = useState('');
  const [contactType, setContactType] = useState<ContactType>('wechat');
  const [contact, setContact] = useState('');
  const [contactLabel, setContactLabel] = useState('');
  const [note, setNote] = useState('');  // Phase 3B: 一行话备注(我有车 / 我能搬重物 …)
  const [submitting, setSubmitting] = useState(false);

  // hydrate nickname + last contact
  useEffect(() => {
    setMounted(true);
    const n = getNickname();
    if (n) setNick(n);
    const last = getLastContact();
    if (last) {
      setContactType(last.contactType);
      setContact(last.contact);
      setContactLabel(last.contactLabel ?? '');
    }
  }, []);

  // ESC 关 + 锁滚
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

  const typeMeta = CONTACT_TYPES.find(t => t.id === contactType)!;

  const submit = async () => {
    const cleanNick = nick.trim().slice(0, 20);
    if (!cleanNick) { showError('请填写你的昵称'); return; }

    const v = validateContactInput(contactType, contact, contactLabel);
    if (!v.ok) { showError(v.error!); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${eventId}/contact-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toCommentId: target.id,  // null 时 server 路由到 event poster
          nickname: cleanNick,
          contactType,
          contact: contact.trim(),
          contactLabel: contactType === 'other' ? contactLabel.trim() : undefined,
          note: note.trim() || undefined,  // Phase 3B
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showError(data.error || '发送失败');
        return;
      }
      // 持久化(下次默认填)
      setNickname(cleanNick);
      setLastContact({
        contactType,
        contact: contact.trim(),
        contactLabel: contactType === 'other' ? contactLabel.trim() : undefined,
      });
      onSent();
    } catch {
      showError('网络故障,稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-card shadow-overlay overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部 */}
        <div className="px-5 py-3 border-b border-stone-200 flex items-center gap-2">
          <Send size={18} className="text-brand" />
          <h2 className="text-base font-semibold text-stone-900">发送我的联系方式</h2>
          <button
            onClick={onClose}
            className="ml-auto text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* 上下文 */}
          <div className="text-sm text-stone-600 leading-relaxed">
            想和 <span className="font-medium text-stone-900">{target.nickname}</span> 一起去
            <br />
            <span className="text-stone-800">「{eventTitle}」</span>
          </div>
          <div className="text-xs text-stone-500 bg-stone-50 rounded-lg p-2.5 border border-stone-200 leading-relaxed">
            💡 TA 会立即在「我的」里看到你发的联系方式;是否回赠完全看 TA — 没回应可能只是没看到
          </div>

          {/* 昵称 */}
          <div>
            <label className="block text-xs text-stone-500 mb-1">你的昵称</label>
            <input
              type="text"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={20}
              placeholder="如何被识别"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
            />
          </div>

          {/* 联系方式类型 */}
          <div>
            <label className="block text-xs text-stone-500 mb-1">联系方式</label>
            <div className="flex gap-2">
              <select
                value={contactType}
                onChange={(e) => setContactType(e.target.value as ContactType)}
                className="px-2.5 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
              >
                {CONTACT_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={typeMeta.placeholder}
                maxLength={80}
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* 其他类型的具体 label */}
          {contactType === 'other' && (
            <div>
              <label className="block text-xs text-stone-500 mb-1">具体平台</label>
              <input
                type="text"
                value={contactLabel}
                onChange={(e) => setContactLabel(e.target.value)}
                placeholder="如 Line / Telegram / Instagram"
                maxLength={20}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
              />
            </div>
          )}

          {/* Phase 3B: 一行话备注(可选) */}
          <div>
            <label className="block text-xs text-stone-500 mb-1">一行话(可选)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="我有车 / 我能搬重物 / 我会打麻将 ..."
              maxLength={80}
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-chip hover:bg-stone-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand text-white rounded-chip hover:bg-brand-dark active:scale-95 transition-all disabled:opacity-50 shadow-card"
          >
            <Send size={14} />
            {submitting ? '发送中...' : '确认发送'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
