'use client';

// 密码找回回路 (Sprint 6 UX-5):用户提交申请的 modal
// 从 EditCodePrompt 内部触发(用户点"申请找回 →" 链接)
// 流程:用户填微信号 + 帖子细节 → POST /api/recovery → toast 提示"24h 内会加微信"

import { useState } from 'react';
import { X } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';

export type RecoveryTarget = {
  type: 'item' | 'listing';
  id: string;
  title: string;
  knownContactValue?: string; // 用户从 EditCodePrompt 上下文知道的联系方式(可空)
};

export function RecoveryRequestModal({
  target,
  onClose,
}: {
  target: RecoveryTarget;
  onClose: () => void;
}) {
  const [contactValue, setContactValue] = useState(target.knownContactValue ?? '');
  const [applicantWechat, setApplicantWechat] = useState('');
  const [applicantNote, setApplicantNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!applicantWechat.trim()) { showError('请填你的微信号'); return; }
    if (!contactValue.trim()) { showError('请填发布时用的联系方式'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: target.type,
          targetId: target.id,
          targetContactValue: contactValue.trim(),
          applicantWechat: applicantWechat.trim(),
          applicantNote: applicantNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || '提交失败');
        return;
      }
      showSuccess('已提交,24h 内站长会加你微信确认', { duration: 6000 });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">申请找回密码</h3>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-stone-600 mb-3 leading-relaxed bg-amber-50 border border-amber-200 rounded p-2">
          你正在申请找回帖子 <strong>「{target.title}」</strong> 的密码。
          站长会用你填的微信加你,确认是本人后重置密码 — 24h 内联系。
          恶意申请会被记录拒绝。
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              你的微信号 <span className="text-rose-500">*</span>
            </label>
            <input
              value={applicantWechat}
              onChange={e => setApplicantWechat(e.target.value)}
              placeholder="站长加你确认用"
              className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              发布时填的联系方式 <span className="text-rose-500">*</span>
            </label>
            <input
              value={contactValue}
              onChange={e => setContactValue(e.target.value)}
              placeholder="发布时填的微信/手机/邮箱"
              className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
            />
            <p className="text-xs text-stone-500 mt-1">
              要跟原帖的联系方式一致,我们用来确认你是发布人
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              帖子细节(选填,加快验证)
            </label>
            <textarea
              value={applicantNote}
              onChange={e => setApplicantNote(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="例:当时定价 / 第一张图是什么 / 标题大概什么"
              className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-stone-300 rounded hover:bg-stone-100 text-sm"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 bg-brand text-white rounded hover:bg-brand-dark disabled:opacity-50 text-sm"
          >
            {submitting ? '提交中…' : '提交申请'}
          </button>
        </div>
      </div>
    </div>
  );
}
