'use client';

// Listing 发帖 modal（A/B/C/D 四种类型走同一表单 + 条件字段）
// 设计：顶部 4 个大按钮选类型，下方字段动态显示

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ImageUpload } from './ImageUpload';
import {
  LISTING_TYPES,
  LISTING_AREAS,
  LISTING_AGE_RANGES,
  CONTACT_TYPES,
} from '@/lib/utils';
import { getStoredUtmSource } from '@/lib/utm';

const LS_LAST_CODE      = 'hb_last_edit_code';
const LS_LAST_CONTACT_T = 'hb_my_contact_type';
const LS_LAST_CONTACT_V = 'hb_my_contact_value';

type TypeId = typeof LISTING_TYPES[number]['id'];

// 每种类型对应的入住日期 label（A/B 是"开始可入住"，C/D 是"lease 起止"固定）
const TYPE_META: Record<TypeId, {
  label: string;
  desc: string;
  emoji: string;
  hasPlace: boolean;
  layoutLabel: string;
  dateLabel: string;
  dateRequiredBoth: boolean;
}> = {
  find_roommate: {
    label: '找室友',     desc: '有房，找一起住的人',  emoji: '🏠', hasPlace: true,
    layoutLabel: '户型',  dateLabel: '可入住时间',     dateRequiredBoth: false,
  },
  co_rent: {
    label: '合租伙伴',   desc: '还没签约，找队友一起找房', emoji: '🤝', hasPlace: false,
    layoutLabel: '期望户型', dateLabel: '期望入住时间', dateRequiredBoth: false,
  },
  sublet: {
    label: '转租',       desc: 'lease 提前结束，转出去', emoji: '📅', hasPlace: true,
    layoutLabel: '户型',  dateLabel: 'Lease 起止日期', dateRequiredBoth: true,
  },
  summer: {
    label: '暑期短租',   desc: '暑假 2-3 个月空房',    emoji: '☀️', hasPlace: true,
    layoutLabel: '户型',  dateLabel: '暑期日期',       dateRequiredBoth: true,
  },
};

const LIFESTYLE_DIMS_UI = [
  { key: 'sleepSchedule', label: '作息', options: [
    { v: 'early',    l: '早睡早起' },
    { v: 'late',     l: '晚睡晚起' },
    { v: 'flexible', l: '灵活' },
  ]},
  { key: 'cleanliness', label: '卫生', options: [
    { v: 'neat',    l: '整洁党' },
    { v: 'average', l: '一般' },
    { v: 'casual',  l: '随性' },
  ]},
  { key: 'social', label: '社交', options: [
    { v: 'quiet',      l: '安静独处' },
    { v: 'occasional', l: '偶尔聚会' },
    { v: 'frequent',   l: '常聚会' },
  ]},
  { key: 'smoking', label: '吸烟', options: [
    { v: 'no',  l: '不吸' },
    { v: 'ok',  l: '能接受' },
    { v: 'yes', l: '吸烟者' },
  ]},
  { key: 'drinking', label: '喝酒', options: [
    { v: 'no',         l: '不喝' },
    { v: 'occasional', l: '偶尔' },
    { v: 'frequent',   l: '常喝' },
  ]},
  { key: 'pets', label: '宠物', options: [
    { v: 'none',  l: '无' },
    { v: 'cat',   l: '有猫' },
    { v: 'dog',   l: '有狗' },
    { v: 'other', l: '其他' },
  ]},
  { key: 'guests', label: '过夜访客', options: [
    { v: 'no',         l: '不接受' },
    { v: 'occasional', l: '偶尔 OK' },
    { v: 'ok',         l: '长期可' },
  ]},
] as const;

export function ListingPostModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<TypeId>('find_roommate');

  // 自我表达
  const [posterGender, setPosterGender] = useState<string>('unspecified');
  const [ageRange, setAgeRange] = useState<string>('');
  const [lookingForGender, setLookingForGender] = useState<string>('any');

  // 内容
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  // 房屋
  const [housingLayout, setHousingLayout] = useState('');
  const [moveInStart, setMoveInStart] = useState('');
  const [moveInEnd, setMoveInEnd] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [areas, setAreas] = useState<string[]>([]);

  // 生活方式（折叠默认隐藏）
  const [showLifestyle, setShowLifestyle] = useState(false);
  const [lifestyle, setLifestyle] = useState<Record<string, string>>({});

  // 联系方式
  const [contactType, setContactType] = useState<string>('wechat');
  const [contactValue, setContactValue] = useState('');
  const [customLabel, setCustomLabel] = useState('');

  const [editCode, setEditCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // localStorage 预填
  useEffect(() => {
    try {
      const tp = localStorage.getItem(LS_LAST_CONTACT_T);
      const v  = localStorage.getItem(LS_LAST_CONTACT_V);
      const c  = localStorage.getItem(LS_LAST_CODE);
      if (tp === 'wechat' || tp === 'phone' || tp === 'email' || tp === 'other') setContactType(tp);
      if (v) setContactValue(v);
      if (c) setEditCode(c);
    } catch {}
  }, []);

  const meta = TYPE_META[type];

  const toggleArea = (a: string) => {
    setAreas(curr => curr.includes(a) ? curr.filter(x => x !== a) : [...curr, a]);
  };

  const submit = async () => {
    if (!title.trim()) return alert('标题不能为空');
    if (!contactValue.trim()) return alert('联系方式不能为空');
    if (editCode.length < 6) return alert('识别码至少 6 位');
    if (meta.dateRequiredBoth && (!moveInStart || !moveInEnd)) {
      return alert('转租 / 暑期需要填完整的起止日期');
    }

    const payload = {
      type,
      posterGender,
      ageRange: ageRange || null,
      lookingForGender,
      title: title.trim(),
      description: description.trim(),
      photoUrls,
      hasPlace: meta.hasPlace,
      housingLayout: housingLayout.trim() || null,
      moveInStart: moveInStart || null,
      moveInEnd: moveInEnd || null,
      budgetMin: budgetMin === '' ? null : Number(budgetMin),
      budgetMax: budgetMax === '' ? null : Number(budgetMax),
      areas,
      ...lifestyle,
      contactType,
      contactValue: contactValue.trim(),
      customContactLabel: contactType === 'other' ? (customLabel.trim() || null) : null,
      editCode,
      utmSource: getStoredUtmSource(),
    };

    setSubmitting(true);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || '发布失败'); return; }
      try {
        localStorage.setItem(LS_LAST_CODE, editCode);
        localStorage.setItem(LS_LAST_CONTACT_T, contactType);
        localStorage.setItem(LS_LAST_CONTACT_V, contactValue.trim());
      } catch {}
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-start sm:items-center justify-center overflow-y-auto p-0 sm:p-4">
      <div className="bg-white w-full max-w-2xl sm:rounded-lg min-h-screen sm:min-h-0 my-0 sm:my-4">

        {/* 顶部固定 */}
        <div className="sticky top-0 z-10 bg-white border-b border-stone-200 px-5 py-3 flex items-center justify-between rounded-t-lg">
          <h2 className="text-lg font-semibold text-stone-900">发布 listing</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-stone-100" aria-label="关闭"><X size={22} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* 1. 类型 4 个大按钮 */}
          <section>
            <Label required>这是哪种？</Label>
            <div className="grid grid-cols-2 gap-2">
              {LISTING_TYPES.map(t => {
                const m = TYPE_META[t.id];
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      type === t.id
                        ? 'border-brand bg-brand/5 ring-2 ring-brand'
                        : 'border-stone-300 bg-white hover:bg-stone-100'
                    }`}
                  >
                    <div className="text-sm font-semibold text-stone-900">
                      {m.emoji} {m.label}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">{m.desc}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. 自我表达 */}
          <section className="space-y-3">
            <Label>关于我（公开展示，方便对方了解你）</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Sub>我是</Sub>
                <Pills value={posterGender} onChange={setPosterGender} options={[
                  { v: 'F', l: 'F' }, { v: 'M', l: 'M' },
                  { v: 'nb', l: '非二元' }, { v: 'unspecified', l: '不愿透露' },
                ]} />
              </div>
              <div>
                <Sub>年龄段</Sub>
                <Pills value={ageRange} onChange={setAgeRange} options={[
                  { v: '', l: '不填' },
                  ...LISTING_AGE_RANGES.map(r => ({ v: r, l: r })),
                ]} />
              </div>
            </div>
            <div>
              <Sub>找谁（性别筛选基于双方自我表达）</Sub>
              <Pills value={lookingForGender} onChange={setLookingForGender} options={[
                { v: 'any', l: '不限性别' },
                { v: 'F-only', l: '仅 F' },
                { v: 'M-only', l: '仅 M' },
              ]} />
            </div>
          </section>

          {/* 3. 标题 + 描述 */}
          <section className="space-y-3">
            <div>
              <Label required>标题</Label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={100}
                placeholder="一句话介绍：例 研一妹子找 9 月入住女室友"
                className="w-full border border-stone-300 rounded px-3 py-2"
              />
            </div>
            <div>
              <Label>详细介绍（成色、户型、性格、希望对方等）</Label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="可写：自我介绍、希望对方的性格、生活习惯、为什么找室友等"
                className="w-full border border-stone-300 rounded px-3 py-2 leading-relaxed"
              />
            </div>
          </section>

          {/* 4. 照片 */}
          <section>
            <Label>照片（推荐房间 / 厨房 / 工作角 / 书架，不建议正脸自拍）</Label>
            <ImageUpload urls={photoUrls} onChange={setPhotoUrls} />
          </section>

          {/* 5. 房屋字段 */}
          <section className="space-y-3 bg-stone-50 rounded-lg p-3 border border-stone-200">
            <div className="text-xs text-stone-500 uppercase font-semibold">房屋</div>

            <div>
              <Sub>{meta.layoutLabel}</Sub>
              <input
                value={housingLayout}
                onChange={e => setHousingLayout(e.target.value)}
                placeholder="例：1B1B / 2B1B / Studio"
                className="w-full border border-stone-300 rounded px-3 py-2"
              />
            </div>

            <div>
              <Sub>{meta.dateLabel}{meta.dateRequiredBoth && ' *'}</Sub>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={moveInStart}
                  onChange={e => setMoveInStart(e.target.value)}
                  className="flex-1 border border-stone-300 rounded px-3 py-2"
                />
                <span className="text-stone-400">至</span>
                <input
                  type="date"
                  value={moveInEnd}
                  onChange={e => setMoveInEnd(e.target.value)}
                  className="flex-1 border border-stone-300 rounded px-3 py-2"
                />
              </div>
            </div>

            <div>
              <Sub>月租预算 (USD)</Sub>
              <div className="flex items-center gap-2">
                <span className="text-stone-500">$</span>
                <input
                  type="number" inputMode="numeric" min={0}
                  value={budgetMin}
                  onChange={e => setBudgetMin(e.target.value)}
                  placeholder="下限"
                  className="w-24 border border-stone-300 rounded px-2 py-2"
                />
                <span className="text-stone-400">—</span>
                <span className="text-stone-500">$</span>
                <input
                  type="number" inputMode="numeric" min={0}
                  value={budgetMax}
                  onChange={e => setBudgetMax(e.target.value)}
                  placeholder="上限"
                  className="w-24 border border-stone-300 rounded px-2 py-2"
                />
                <span className="text-stone-500 text-sm">/月</span>
              </div>
            </div>

            <div>
              <Sub>区域（可多选）</Sub>
              <div className="flex flex-wrap gap-1.5">
                {LISTING_AREAS.map(a => {
                  const active = areas.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleArea(a)}
                      className={`px-3 py-1.5 text-sm rounded-chip border transition-colors ${
                        active
                          ? 'bg-brand/10 border-brand text-brand font-medium'
                          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                      }`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 6. 生活方式（折叠） */}
          <section>
            <button
              type="button"
              onClick={() => setShowLifestyle(s => !s)}
              className="w-full flex items-center justify-between text-sm text-stone-600 hover:text-stone-900 py-2"
            >
              <span>{showLifestyle ? '▾' : '▸'} 生活方式（{Object.values(lifestyle).filter(Boolean).length} 项已填，可选）</span>
            </button>
            {showLifestyle && (
              <div className="space-y-3 pt-2">
                {LIFESTYLE_DIMS_UI.map(dim => (
                  <div key={dim.key}>
                    <Sub>{dim.label}</Sub>
                    <Pills
                      value={lifestyle[dim.key] ?? ''}
                      onChange={v => setLifestyle(s => ({ ...s, [dim.key]: v }))}
                      options={[
                        { v: '', l: '—' },
                        ...dim.options.map(o => ({ v: o.v, l: o.l })),
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 7. 联系方式 + 识别码 */}
          <section className="space-y-3 bg-stone-50 rounded-lg p-3 border border-stone-200">
            <div className="text-xs text-stone-500 uppercase font-semibold">联系方式</div>
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              💡 你的联系方式 <strong>默认隐藏</strong>，只在你同意某个申请人后，才双向可见
            </div>
            <div className="flex gap-2">
              <select
                value={contactType}
                onChange={e => setContactType(e.target.value)}
                className="border border-stone-300 rounded px-2 py-2"
              >
                {CONTACT_TYPES.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.id === 'wechat' ? '微信' : c.id === 'phone' ? '手机' : c.id === 'email' ? '邮箱' : '其他'}
                  </option>
                ))}
              </select>
              <input
                value={contactValue}
                onChange={e => setContactValue(e.target.value)}
                placeholder={CONTACT_TYPES.find(c => c.id === contactType)?.placeholder ?? ''}
                className="flex-1 border border-stone-300 rounded px-3 py-2"
              />
              {contactType === 'other' && (
                <input
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  placeholder="标签"
                  className="w-24 border border-stone-300 rounded px-2 py-2"
                />
              )}
            </div>
          </section>

          <section>
            <Label required>识别码（≥6 位，用于以后修改/删除/审批申请）</Label>
            <input
              type="password"
              value={editCode}
              onChange={e => setEditCode(e.target.value)}
              minLength={6}
              placeholder="例：myroom123"
              className="w-full border border-stone-300 rounded px-3 py-2"
            />
            <p className="text-xs text-stone-500 mt-1">
              💡 这不是密码——只是用来证明这条信息是你发的。丢了无法找回；浏览器会本地记住，下次自动填。
            </p>
          </section>
        </div>

        {/* 底部固定 */}
        <div className="sticky bottom-0 bg-white border-t border-stone-200 px-5 py-3 flex justify-end gap-2 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 rounded hover:bg-stone-100">
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2 bg-brand text-white rounded hover:bg-brand-dark disabled:opacity-50 font-medium"
          >
            {submitting ? '发布中…' : '发布'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="text-sm font-medium text-stone-700 mb-1.5">
      {children}{required && <span className="text-brand"> *</span>}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-stone-500 mb-1.5">{children}</div>;
}

function Pills({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 text-sm rounded-chip border transition-colors ${
            value === o.v
              ? 'bg-brand/10 border-brand text-brand font-medium'
              : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
