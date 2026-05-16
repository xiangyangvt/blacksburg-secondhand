'use client';

// Phase 3A 用户发布 event 模态框
//
// 字段:标题/类别(含 other 自填)/开始时间/结束时间/地点/描述/昵称/联系方式(可选,公开 toggle)/识别码(6 位)
// 图片上传 defer 到下个版本
//
// 提交 POST /api/events;成功后 onCreated(event) 回调让父组件刷新
// 编辑模式:传 initial,提交走 PATCH /api/events/[id]

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Copy } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';
import { CONTACT_TYPES, type ContactType } from '@/lib/contactTypes';
import { getNickname, setNickname as persistNickname, getLastContact, setLastContact } from '@/lib/eventNickname';

const CATEGORIES = [
  { id: 'events',     label: '活动' },
  { id: 'sports',     label: '体育' },
  { id: 'discussion', label: '讨论' },
  { id: 'other',      label: '其他' },
] as const;
type CatId = typeof CATEGORIES[number]['id'];

export type EventPostInitial = {
  id: string;
  title: string;
  category: string;
  customCategory: string | null;
  description: string;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  posterNickname: string;
  posterContactType: string | null;
  posterContact: string | null;
  posterContactLabel: string | null;
  posterContactPublic: boolean;
};

function gen6Code(): string {
  // 100000-999999
  return String(Math.floor(100000 + Math.random() * 900000));
}

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // 转 ET 给 datetime-local input(YYYY-MM-DDTHH:mm 格式)
  // 注:datetime-local 是 local browser tz,我们直接给 ISO 让浏览器处理
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventPostModal({
  initial, onClose, onCreated,
}: {
  initial?: EventPostInitial;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const isEdit = !!initial;
  const [mounted, setMounted] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<CatId>(
    (initial?.category as CatId) ?? 'events',
  );
  const [customCategory, setCustomCategory] = useState(initial?.customCategory ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startAt, setStartAt] = useState(toLocalDateTimeInput(initial?.startAt ?? null));
  const [endAt, setEndAt] = useState(toLocalDateTimeInput(initial?.endAt ?? null));
  const [location, setLocation] = useState(initial?.location ?? '');
  const [nickname, setNick] = useState(initial?.posterNickname ?? '');
  const [contactType, setContactType] = useState<ContactType>(
    (initial?.posterContactType as ContactType) ?? 'wechat',
  );
  const [contact, setContact] = useState(initial?.posterContact ?? '');
  const [contactLabel, setContactLabel] = useState(initial?.posterContactLabel ?? '');
  const [contactPublic, setContactPublic] = useState(initial?.posterContactPublic ?? false);
  const [code, setCode] = useState(isEdit ? '' : gen6Code());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // 新发布时:hydrate 昵称 + 上次联系方式
  useEffect(() => {
    if (isEdit) return;
    const n = getNickname();
    if (n && !nickname) setNick(n);
    const last = getLastContact();
    if (last && !contact) {
      setContactType(last.contactType);
      setContact(last.contact);
      if (last.contactLabel) setContactLabel(last.contactLabel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ESC + 锁滚
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

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showSuccess('识别码已复制');
    } catch {
      showError('复制失败');
    }
  };

  const submit = async () => {
    const t = title.trim();
    const d = description.trim();
    const n = nickname.trim();
    if (!t) return showError('请填写标题');
    if (!d) return showError('请填写描述');
    if (!n) return showError('请填写昵称');
    if (category === 'other' && !customCategory.trim()) return showError('请填写「其他」类别名称');
    if (!isEdit && !/^\d{6}$/.test(code)) return showError('识别码必须是 6 位数字');
    if (contact.trim() && !contactType) return showError('请选联系方式类型');
    if (contactType === 'other' && contact.trim() && !contactLabel.trim()) {
      return showError('请填写「其他」联系方式的具体平台(如 Line)');
    }

    setSubmitting(true);
    try {
      const body: any = {
        title: t,
        category,
        customCategory: category === 'other' ? customCategory.trim() : null,
        description: d,
        nickname: n,
        startAt: startAt ? new Date(startAt).toISOString() : null,
        endAt: endAt ? new Date(endAt).toISOString() : null,
        location: location.trim() || null,
        contactType: contact.trim() ? contactType : null,
        contact: contact.trim() || null,
        contactLabel: contactType === 'other' ? contactLabel.trim() : null,
        contactPublic,
      };
      if (!isEdit) body.code = code;

      const url = isEdit ? `/api/events/${initial!.id}` : `/api/events`;
      const method = isEdit ? 'PATCH' : 'POST';
      if (isEdit) body.code = code; // 编辑也需要识别码

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showError(data.error || (isEdit ? '编辑失败' : '发布失败'));
        return;
      }
      persistNickname(n);
      if (contact.trim()) {
        setLastContact({
          contactType,
          contact: contact.trim(),
          contactLabel: contactType === 'other' ? contactLabel.trim() : undefined,
        });
      }
      showSuccess(isEdit ? '已更新' : '已发布,记好识别码');
      onCreated?.();
      onClose();
    } catch {
      showError('网络故障,稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-card shadow-overlay my-2 sm:my-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-3 flex items-center gap-2 rounded-t-card z-10">
          <Plus size={18} className="text-brand" />
          <h2 className="text-base font-semibold text-stone-900">
            {isEdit ? '编辑活动' : '发布黑堡本地活动'}
          </h2>
          <button onClick={onClose} className="ml-auto text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100" aria-label="关闭">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* 标题 */}
          <Field label="标题" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              placeholder="如:周末黑堡公园露营,找搭子"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
            />
          </Field>

          {/* 类别 */}
          <Field label="类别" required>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`px-3 py-1.5 rounded-chip text-sm font-medium border ${
                    category === c.id
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {category === 'other' && (
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                maxLength={20}
                placeholder="自填类别名,如:户外 / 美食 / 学习"
                className="mt-2 w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
              />
            )}
          </Field>

          {/* 时间 */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="开始时间">
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
              />
            </Field>
            <Field label="结束时间">
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
              />
            </Field>
          </div>

          {/* 地点 */}
          <Field label="地点">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={80}
              placeholder="如:Lane Stadium, Blacksburg"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
            />
          </Field>

          {/* 描述 */}
          <Field label="描述" required>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="活动详情、想找几个人、装备需求等"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-card focus:outline-none focus:border-brand resize-y"
            />
            <div className="text-xs text-stone-400 text-right">{description.length} / 500</div>
          </Field>

          {/* 昵称 */}
          <Field label="发布者昵称" required>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNick(e.target.value)}
              maxLength={20}
              placeholder="如何被识别"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
            />
          </Field>

          {/* 联系方式(可选) */}
          <Field label="联系方式(可选)">
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
                placeholder={CONTACT_TYPES.find(t => t.id === contactType)?.placeholder}
                maxLength={80}
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
              />
            </div>
            {contactType === 'other' && contact && (
              <input
                type="text"
                value={contactLabel}
                onChange={(e) => setContactLabel(e.target.value)}
                placeholder="平台名(如 Line / Telegram)"
                maxLength={20}
                className="mt-2 w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
              />
            )}
            {contact && (
              <label className="flex items-center gap-2 mt-2 text-xs text-stone-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={contactPublic}
                  onChange={(e) => setContactPublic(e.target.checked)}
                  className="rounded"
                />
                公开显示联系方式(否则别人想联系你只能用「发送我的联系方式」单向交换)
              </label>
            )}
          </Field>

          {/* 识别码(新发布显示;编辑时填验证) */}
          <Field label={isEdit ? '识别码(编辑需验证)' : '识别码 — 记好,编辑/删除要用'} required>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                placeholder="6 位数字"
                className="flex-1 px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand font-mono tracking-widest"
              />
              {!isEdit && (
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium bg-stone-100 text-stone-700 rounded-chip hover:bg-stone-200"
                  title="复制"
                >
                  <Copy size={12} />
                  复制
                </button>
              )}
            </div>
            {!isEdit && (
              <div className="text-[11px] text-stone-400 mt-1">
                💡 建议保存到备忘录;丢了可以去 admin 后台找回
              </div>
            )}
          </Field>
        </div>

        <div className="sticky bottom-0 bg-stone-50 border-t border-stone-200 px-5 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-chip hover:bg-stone-100"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand text-white rounded-chip hover:bg-brand-dark active:scale-95 disabled:opacity-50 shadow-card"
          >
            <Plus size={14} />
            {submitting ? '...' : isEdit ? '保存修改' : '发布'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-stone-500 mb-1">
        {label}
        {required && <span className="text-rose-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
