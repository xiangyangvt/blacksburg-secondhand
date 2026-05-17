'use client';

// Admin 客户端 panel:列表 + 操作按钮(已联系 / 已重置 / 拒绝)

import { useState } from 'react';
import { showError, showSuccess } from '@/lib/toast';

type RecoveryItem = {
  id: string;
  targetType: string;
  targetId: string | null;
  targetContactValue: string;
  applicantWechat: string;
  applicantNote: string | null;
  ipAddress: string | null;
  status: string;
  adminNotes: string | null;
  resolvedEditCode: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const STATUS_TABS = [
  { value: 'pending',   label: '待处理' },
  { value: 'contacted', label: '已联系' },
  { value: 'resolved',  label: '已重置' },
  { value: 'rejected',  label: '已拒绝' },
  { value: 'abuse',     label: '滥用' },
  { value: 'all',       label: '全部' },
];

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-800 border-amber-200',
  contacted: 'bg-blue-50 text-blue-800 border-blue-200',
  resolved:  'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected:  'bg-stone-100 text-stone-700 border-stone-300',
  abuse:     'bg-rose-50 text-rose-800 border-rose-200',
};

export function RecoveryAdminPanel({
  initialItems,
  initialStatus,
}: {
  initialItems: RecoveryItem[];
  initialStatus: string;
}) {
  const [items, setItems] = useState<RecoveryItem[]>(initialItems);
  const [busy, setBusy] = useState<string | null>(null);

  const switchTab = (status: string) => {
    window.location.href = `/admin/recovery?status=${status}`;
  };

  const updateItem = async (id: string, updates: Partial<RecoveryItem>) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/recovery/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || '操作失败'); return; }
      // 本地更新
      setItems(prev => prev.map(it => it.id === id ? { ...it, ...data.item } : it));
      showSuccess('已更新');
    } finally {
      setBusy(null);
    }
  };

  const generateAndCopyCode = async (id: string) => {
    // 生成 8 位随机密码
    const newCode = Math.random().toString(36).substring(2, 6) + Math.random().toString(36).substring(2, 6);
    try {
      await navigator.clipboard.writeText(newCode);
      showSuccess(`新密码已复制: ${newCode}`, { duration: 8000 });
    } catch {
      prompt('复制下面的新密码,微信发给申请人:', newCode);
    }
    await updateItem(id, { status: 'resolved', resolvedEditCode: newCode });
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      {/* Status tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
        {STATUS_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => switchTab(t.value)}
            className={`px-3 py-1.5 rounded-chip text-sm whitespace-nowrap transition-colors ${
              initialStatus === t.value
                ? 'bg-brand text-white'
                : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <p>没有 {STATUS_TABS.find(t => t.value === initialStatus)?.label ?? ''} 的申请</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-card border border-stone-200 p-4 shadow-card">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[item.status] ?? STATUS_COLOR.pending}`}>
                    {STATUS_TABS.find(t => t.value === item.status)?.label ?? item.status}
                  </span>
                  <span className="text-xs text-stone-500">
                    {item.targetType} · {new Date(item.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                {item.ipAddress && (
                  <span className="text-xs text-stone-400 font-mono">{item.ipAddress}</span>
                )}
              </div>

              <div className="space-y-1.5 text-sm mb-3">
                <div>
                  <span className="text-stone-500">申请人微信:</span>{' '}
                  <strong className="font-mono select-all">{item.applicantWechat}</strong>
                  <button
                    onClick={() => navigator.clipboard.writeText(item.applicantWechat).then(() => showSuccess('已复制'))}
                    className="ml-2 text-xs text-brand hover:underline"
                  >
                    复制
                  </button>
                </div>
                <div>
                  <span className="text-stone-500">原帖联系方式:</span>{' '}
                  <span className="font-mono select-all">{item.targetContactValue}</span>
                </div>
                {item.targetId && (
                  <div>
                    <span className="text-stone-500">帖子 ID:</span>{' '}
                    <a
                      href={item.targetType === 'listing' ? `/listing/${item.targetId}` : `/item/${item.targetId}`}
                      target="_blank"
                      className="font-mono text-brand hover:underline"
                    >
                      {item.targetId}
                    </a>
                  </div>
                )}
                {item.applicantNote && (
                  <div>
                    <span className="text-stone-500">申请人备注:</span>{' '}
                    <span className="text-stone-700">{item.applicantNote}</span>
                  </div>
                )}
                {item.resolvedEditCode && (
                  <div>
                    <span className="text-stone-500">已发出新密码:</span>{' '}
                    <span className="font-mono select-all bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded">{item.resolvedEditCode}</span>
                  </div>
                )}
              </div>

              {item.status === 'pending' && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-100">
                  <button
                    onClick={() => updateItem(item.id, { status: 'contacted' })}
                    disabled={busy === item.id}
                    className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 disabled:opacity-50"
                  >
                    已联系
                  </button>
                  <button
                    onClick={() => generateAndCopyCode(item.id)}
                    disabled={busy === item.id}
                    className="px-3 py-1.5 text-sm bg-emerald-50 text-emerald-700 rounded border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    生成新密码 + 标 resolved
                  </button>
                  <button
                    onClick={() => updateItem(item.id, { status: 'rejected' })}
                    disabled={busy === item.id}
                    className="px-3 py-1.5 text-sm bg-stone-100 text-stone-700 rounded border border-stone-300 hover:bg-stone-200 disabled:opacity-50"
                  >
                    拒绝
                  </button>
                  <button
                    onClick={() => updateItem(item.id, { status: 'abuse' })}
                    disabled={busy === item.id}
                    className="px-3 py-1.5 text-sm bg-rose-50 text-rose-700 rounded border border-rose-200 hover:bg-rose-100 disabled:opacity-50"
                  >
                    滥用
                  </button>
                </div>
              )}

              {item.status === 'contacted' && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-100">
                  <button
                    onClick={() => generateAndCopyCode(item.id)}
                    disabled={busy === item.id}
                    className="px-3 py-1.5 text-sm bg-emerald-50 text-emerald-700 rounded border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    生成新密码 + 标 resolved
                  </button>
                  <button
                    onClick={() => updateItem(item.id, { status: 'rejected' })}
                    disabled={busy === item.id}
                    className="px-3 py-1.5 text-sm bg-stone-100 text-stone-700 rounded border border-stone-300 hover:bg-stone-200 disabled:opacity-50"
                  >
                    拒绝
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
