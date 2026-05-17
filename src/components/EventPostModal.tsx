'use client';

// Phase 3A 用户发布 event 模态框
//
// 字段:标题/类别(含 other 自填)/开始时间/结束时间/地点/描述/昵称/联系方式(可选,公开 toggle)/密码(6 位)
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

// 跟二手/室友共用 — 三平台都从同一处读取/写入上次用的密码
const LS_LAST_EDIT_CODE = 'hb_last_edit_code';

// Phase 3A.1: 用户可选 5 大类别 + 自定义
const CATEGORIES = [
  { id: 'life',        label: '生活' },
  { id: 'exercise',    label: '运动' },
  { id: 'academic',    label: '学术' },
  { id: 'competition', label: '比赛' },
  { id: 'discussion',  label: '讨论' },
  { id: 'other',       label: '其他' },
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

// 跟二手/室友同款:6 位 alphanumeric(不限数字),默认生成 6 位混合方便记
function gen6Code(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'; // 去掉容易混淆的 i/l/o/0/1
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// 城市预设
const CITIES = [
  { id: 'Blacksburg',     label: 'Blacksburg' },
  { id: 'Christiansburg', label: 'Christiansburg' },
  { id: 'other',          label: '其他' },
] as const;
type CityId = typeof CITIES[number]['id'];

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
    (initial?.category as CatId) ?? 'life',
  );
  const [customCategory, setCustomCategory] = useState(initial?.customCategory ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startAt, setStartAt] = useState(toLocalDateTimeInput(initial?.startAt ?? null));
  const [endAt, setEndAt] = useState(toLocalDateTimeInput(initial?.endAt ?? null));
  // 地点拆 venue + city — 编辑模式从 initial.location 解析(lastIndexOf 切城市)
  const [venue, setVenue] = useState(() => {
    const loc = initial?.location ?? '';
    if (!loc) return '';
    const idx = loc.lastIndexOf(',');
    return idx < 0 ? '' : loc.slice(0, idx).trim();
  });
  const [city, setCity] = useState<CityId>(() => {
    const loc = initial?.location ?? '';
    if (!loc) return 'Blacksburg';
    const idx = loc.lastIndexOf(',');
    const c = idx < 0 ? loc.trim() : loc.slice(idx + 1).trim();
    if (c === 'Blacksburg' || c === 'Christiansburg') return c;
    return 'other';
  });
  const [customCity, setCustomCity] = useState(() => {
    const loc = initial?.location ?? '';
    const idx = loc.lastIndexOf(',');
    const c = idx < 0 ? loc.trim() : loc.slice(idx + 1).trim();
    if (c && c !== 'Blacksburg' && c !== 'Christiansburg') return c;
    return '';
  });
  const [nickname, setNick] = useState(initial?.posterNickname ?? '');
  const [contactType, setContactType] = useState<ContactType>(
    (initial?.posterContactType as ContactType) ?? 'wechat',
  );
  const [contact, setContact] = useState(initial?.posterContact ?? '');
  const [contactLabel, setContactLabel] = useState(initial?.posterContactLabel ?? '');
  const [contactPublic, setContactPublic] = useState(initial?.posterContactPublic ?? false);
  const [code, setCode] = useState(isEdit ? '' : '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // 新发布时:hydrate 昵称 + 上次联系方式 + 密码(跟二手/室友共用 hb_last_edit_code)
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
    // 密码:优先用 localStorage 里二手/室友共用的;否则用 gen6Code() 兜底
    try {
      const saved = localStorage.getItem(LS_LAST_EDIT_CODE);
      setCode(saved && saved.length >= 6 ? saved : gen6Code());
    } catch {
      setCode(gen6Code());
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
      showSuccess('密码已复制');
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
    if (!isEdit && (code.length < 6 || code.length > 50)) return showError('密码至少 6 位');
    if (contact.trim() && !contactType) return showError('请选联系方式类型');
    if (contactType === 'other' && contact.trim() && !contactLabel.trim()) {
      return showError('请填写「其他」联系方式的具体平台(如 Line)');
    }

    // 拼 location:venue + city → "Venue, City" 让 parseLocation 能切
    const cityVal = city === 'other' ? customCity.trim() : city;
    if (city === 'other' && !cityVal) return showError('请填写城市');
    const locationStr = venue.trim()
      ? `${venue.trim()}, ${cityVal}`
      : cityVal;

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
        location: locationStr || null,
        contactType: contact.trim() ? contactType : null,
        contact: contact.trim() || null,
        contactLabel: contactType === 'other' ? contactLabel.trim() : null,
        contactPublic,
      };
      if (!isEdit) body.code = code;

      const url = isEdit ? `/api/events/${initial!.id}` : `/api/events`;
      const method = isEdit ? 'PATCH' : 'POST';
      if (isEdit) body.code = code; // 编辑也需要密码

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
      // 新发布成功 → 把密码写回共用 LS,下次二手/室友/活动都自动填
      if (!isEdit) {
        try { localStorage.setItem(LS_LAST_EDIT_CODE, code); } catch {}
      }
      showSuccess(isEdit ? '已更新' : '已发布,记好密码');
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

          {/* 时间 — mobile 堆叠避免 datetime-local 溢出;sm+ 并排 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="开始时间">
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
              />
            </Field>
            <Field label="结束时间">
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
              />
            </Field>
          </div>

          {/* 地点 — 具体地址 + 城市分开;城市默认 Blacksburg */}
          <Field label="地点">
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              maxLength={80}
              placeholder="具体地址(可选,如 Lane Stadium)"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
            />
            <div className="flex gap-2 mt-2">
              <select
                value={city}
                onChange={(e) => setCity(e.target.value as CityId)}
                className="px-2.5 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
              >
                {CITIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              {city === 'other' && (
                <input
                  type="text"
                  value={customCity}
                  onChange={(e) => setCustomCity(e.target.value)}
                  maxLength={40}
                  placeholder="自填城市名,如 Radford"
                  className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand"
                />
              )}
            </div>
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

          {/* 联系方式(可选) — 默认对公众隐藏 */}
          <Field label="联系方式(可选 · 默认对公众隐藏,只用于识别发布者)">
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

          {/* 密码(新发布显示;编辑时填验证) — 跟 二手/室友 同款:至少 6 位 alphanumeric */}
          <Field label={isEdit ? '密码（编辑需验证）' : '密码'} required>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 50))}
                minLength={6}
                maxLength={50}
                placeholder="例：myevent123"
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-chip focus:outline-none focus:border-brand font-mono"
              />
              {!isEdit && (
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium bg-stone-100 text-stone-700 rounded-chip hover:bg-stone-200 flex-shrink-0"
                  title="复制"
                >
                  <Copy size={12} />
                  复制
                </button>
              )}
            </div>
            {!isEdit && (
              <div className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                ⚠️ "联系方式 + 密码" = 你管理这条发布的凭证。改 / 删 / 查"我的"都要用。<br />
                我们加密保存,自己也看不到 —— <strong>丢了无法找回</strong>,但可以凭联系方式申请人工找回。
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
