'use client';

// Phase 3A 用户发布 event 模态框
//
// 字段:标题/类别(含 other 自填)/开始时间/结束时间/地点/描述/昵称/联系方式(可选,公开 toggle)/密码(6 位)
// 图片上传 defer 到下个版本
//
// 提交 POST /api/events;成功后 onCreated(event) 回调让父组件刷新
// 编辑模式:传 initial,提交走 PATCH /api/events/[id]

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Copy } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';
import { CONTACT_TYPES, type ContactType } from '@/lib/contactTypes';
import {
  getNickname, setNickname as persistNickname,
  getLastContact, setLastContact,
  setLastEventTemplate,
} from '@/lib/eventNickname';
import { SessionTopBar } from './SessionTopBar';

// 跟二手/室友共用 — 三平台都从同一处读取/写入上次用的密码
const LS_LAST_EDIT_CODE = 'hb_last_edit_code';

// Phase 3A.1: 用户可选 5 大类别 + 自定义
// Phase 3B: 移除 discussion(Event 通用化后只保留组活动 / 求助场景)
const CATEGORIES = [
  { id: 'life',        label: '生活' },
  { id: 'exercise',    label: '运动' },
  { id: 'academic',    label: '学术' },
  { id: 'competition', label: '比赛' },
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
  maxAttendees?: number | null;  // Phase 3B
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

// 类目自动猜:用户输入标题时(仅 create / forceNew 模式 & 用户未手动改过类目)
// 命中关键词就 set 对应分类。spec §4.1 - 类目要先于联系方式被用户感知
const CATEGORY_KEYWORDS: Array<{ cat: 'life' | 'exercise' | 'academic' | 'competition'; words: string[] }> = [
  { cat: 'life',        words: ['麻将', '桌游', '聚餐', '吃饭', '撸串', '火锅', '聚会', 'dinner', 'lunch', 'brunch', 'party'] },
  { cat: 'exercise',    words: ['球', '跑步', '健身', '游泳', '篮球', '足球', '羽毛球', '乒乓', '瑜伽', '徒步', '骑行', '攀岩', '滑雪', 'gym', 'run', 'hike', 'climb'] },
  { cat: 'academic',    words: ['作业', '复习', 'study', '写代码', '学习', 'project', 'study group', '讨论作业'] },
  { cat: 'competition', words: ['比赛', '锦标', '决赛', '联赛', '对抗', '挑战赛'] },
];

function guessCategory(title: string): 'life' | 'exercise' | 'academic' | 'competition' | null {
  const t = title.toLowerCase();
  for (const { cat, words } of CATEGORY_KEYWORDS) {
    if (words.some(w => t.includes(w.toLowerCase()))) return cat;
  }
  return null;
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
  initial, onClose, onCreated, forceNew,
}: {
  initial?: EventPostInitial;
  onClose: () => void;
  onCreated?: () => void;
  /**
   * "再发一次" 场景:传 initial 预填字段,但 submit 走 POST(新建 event)而非 PATCH。
   * 此时 hydrate / 密码生成 / 模板存储行为跟普通 create 一致。
   */
  forceNew?: boolean;
}) {
  // forceNew 时,即使有 initial 也算 create 路径(不走 PATCH;走 POST 新建)
  const isEdit = !forceNew && !!initial;
  const [mounted, setMounted] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState<CatId>(() => {
    const c = initial?.category;
    // Phase 3B: 砍 discussion,旧数据编辑时若是 discussion 降级到 life
    const valid = CATEGORIES.some(cat => cat.id === c);
    return valid ? (c as CatId) : 'life';
  });
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
  // Phase 3B: 想找几人(空字符串 = 不限);UI 用 string 方便清空,提交时 parse
  const [maxAttendees, setMaxAttendees] = useState<string>(initial?.maxAttendees ? String(initial.maxAttendees) : '');
  const [code, setCode] = useState(isEdit ? '' : '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // session 预填:只在首次拿到 session 时跑一次,用户改后不覆盖
  const sessionPrefilledRef = useRef(false);
  const handleSessionChange = (s: { email: string; contactValue: string | null; contactType: string | null; nickname: string | null } | null) => {
    if (isEdit) return;
    if (sessionPrefilledRef.current) return;
    if (!s) return;
    if (s.nickname && !nickname.trim()) {
      setNick(s.nickname);
    }
    const tp = s.contactType;
    const validTypes = ['wechat', 'phone', 'discord', 'email', 'other'] as const;
    if (s.contactValue && tp && (validTypes as readonly string[]).includes(tp)) {
      setContactType(tp as ContactType);
      setContact(s.contactValue);
    } else if (s.email) {
      setContactType('email');
      setContact(s.email);
    }
    sessionPrefilledRef.current = true;
  };

  // 类目自动猜:仅 create 模式 + 用户未手动改过类目时,根据标题关键词推断
  // 用户点 chip 选 category 时 set ref = true,之后即使改标题也不再覆盖
  // forceNew("再发一次") 时,initial.category 已是用户上次选定的 → 视为已 touched 不再自动猜
  const userTouchedCategoryRef = useRef<boolean>(!!(forceNew && initial?.category));
  useEffect(() => {
    if (isEdit) return;
    if (userTouchedCategoryRef.current) return;
    const guessed = guessCategory(title);
    if (guessed && guessed !== category) {
      setCategory(guessed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, isEdit]);

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
        maxAttendees: maxAttendees.trim() ? parseInt(maxAttendees, 10) : null,
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
        // Phase 3B: 存模板供"再发一次"
        setLastEventTemplate({
          title: t,
          category,
          customCategory: category === 'other' ? customCategory.trim() : null,
          description: d,
          startAt: startAt ? new Date(startAt).toISOString() : null,
          endAt: endAt ? new Date(endAt).toISOString() : null,
          location: locationStr || null,
          maxAttendees: maxAttendees.trim() ? parseInt(maxAttendees, 10) : null,
        });
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
      className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center overflow-x-hidden overflow-y-auto p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl sm:rounded-card shadow-overlay min-h-screen sm:min-h-0 my-0 sm:my-4 overflow-x-hidden sm:overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-3 flex items-center gap-2 sm:rounded-t-card z-10">
          <Plus size={18} className="text-brand" />
          <h2 className="text-base font-semibold text-stone-900">
            {isEdit ? '编辑活动' : forceNew ? '重新发布' : '发布活动'}
          </h2>
          <button onClick={onClose} className="ml-auto text-stone-500 hover:text-stone-900 p-1 rounded-full hover:bg-stone-100" aria-label="关闭">
            <X size={20} />
          </button>
        </div>

        <SessionTopBar onSessionChange={handleSessionChange} />

        <div className="p-5 space-y-3">
          {/* Sprint 7 §4.1 字段顺序:标题 / 时间 / 想找几人 / 类目 / 联系方式 / 昵称 / 地点 / 描述 / 密码 */}

          {/* 标题 */}
          <Field label="标题" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              placeholder="如:周末黑堡公园露营,找搭子"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
            />
          </Field>

          {/* 时间 — mobile 堆叠避免 datetime-local 溢出;sm+ 并排 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="开始时间">
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
              />
            </Field>
            <Field label="结束时间">
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
              />
            </Field>
          </div>

          {/* 想找几人 — Phase 3B 通用化字段。空 = 不限 */}
          <Field label="想找几人(可选)">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={maxAttendees}
              onChange={(e) => setMaxAttendees(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
              placeholder="例:4(留空 = 不限)"
              className="w-24 px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
            />
          </Field>

          {/* 类目 — Sprint 7:自动根据标题关键词猜,用户改后不再覆盖 */}
          <Field label="类别" required>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { userTouchedCategoryRef.current = true; setCategory(c.id); }}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    category === c.id
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
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
                className="mt-2 w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
              />
            )}
          </Field>

          {/* 联系方式(可选) — 默认对公众隐藏 */}
          <Field label="联系方式(可选 · 默认对公众隐藏,只用于识别发布者)">
            <div className="flex gap-2">
              <select
                value={contactType}
                onChange={(e) => setContactType(e.target.value as ContactType)}
                className="px-2.5 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
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
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
              />
            </div>
            {contactType === 'other' && contact && (
              <input
                type="text"
                value={contactLabel}
                onChange={(e) => setContactLabel(e.target.value)}
                placeholder="平台名(如 Line / Telegram)"
                maxLength={20}
                className="mt-2 w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
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

          {/* 昵称 — Sprint 7:placeholder 提示已从历史填入,可改 */}
          <Field label="发布者昵称" required>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNick(e.target.value)}
              maxLength={20}
              placeholder="已自动从历史填入 / 可改"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
            />
          </Field>

          {/* 地点 — 具体地址 + 城市分开;城市默认 Blacksburg */}
          <Field label="地点">
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              maxLength={80}
              placeholder="具体地址(可选,如 Lane Stadium)"
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
            />
            <div className="flex gap-2 mt-2">
              <select
                value={city}
                onChange={(e) => setCity(e.target.value as CityId)}
                className="px-2.5 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
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
                  className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand"
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
              className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand resize-y"
            />
            <div className="text-xs text-stone-400 text-right">{description.length} / 500</div>
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
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-stone-300 rounded-md focus:outline-none focus:border-brand font-mono"
              />
              {!isEdit && (
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium bg-stone-100 text-stone-700 rounded-md hover:bg-stone-200 flex-shrink-0"
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

        <div className="sticky bottom-0 bg-white border-t border-stone-200 px-5 py-3 flex justify-end gap-2 sm:rounded-b-card">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-full hover:bg-stone-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-6 py-2 text-sm font-medium bg-brand text-white rounded-full hover:bg-brand-dark active:scale-95 disabled:opacity-50 shadow-card transition-colors"
          >
            {submitting ? '...' : isEdit ? '保存修改' : '发布'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  // min-w-0 让 Field 在 grid/flex 中能 shrink — datetime-local native 渲染较宽时不撑破父容器
  return (
    <div className="min-w-0">
      <label className="block text-xs text-stone-500 mb-1">
        {label}
        {required && <span className="text-rose-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
