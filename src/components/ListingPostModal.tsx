'use client';

// Listing 发帖 modal —— A/B/C/D 类型差异化版
// - 性别：男生 / 女生（不再有 nb / unspecified；DB 仍接受历史值以兼容）
// - 年龄段：<21 / 21-25 / >25
// - 入住时间：A/B 用模糊 chips（立即/1月内/春/暑/秋/灵活），可选具体日期
//             C/D 用具体日期（必填）
// - A 特有：现住几人（"你将加入 N 人"）
// - C/D 特有：是否带家具（D 默认勾选）

import { useState, useEffect, useRef } from 'react';
import { X, Copy, Plus } from 'lucide-react';
import { ImageUpload } from './ImageUpload';
import {
  LISTING_TYPES,
  LISTING_AREAS,
  LISTING_AGE_RANGES,
  LISTING_GENDERS_UI,
  LISTING_MOVEIN_FUZZY,
  CONTACT_TYPES,
} from '@/lib/utils';
import { getStoredUtmSource } from '@/lib/utm';
import { showError, showWarning, showSuccess } from '@/lib/toast';
import { validateContact, contactPlaceholder } from '@/lib/contactValidation';

const LS_LAST_CODE      = 'hb_last_edit_code';
const LS_LAST_CONTACT_T = 'hb_my_contact_type';
const LS_LAST_CONTACT_V = 'hb_my_contact_value';

type TypeId = typeof LISTING_TYPES[number]['id'];

/**
 * 每种类型的元信息 + 字段开关
 * - hasPlace：是否本人已有房（影响 DB 字段；A/C/D 是；B 否）
 * - layoutLabel：户型字段显示文案
 * - dateRequiredBoth：是否要求 start+end 都填（C/D 是）
 * - showMoveInFuzzy：是否显示模糊 chips（A/B 是）
 * - showCurrentResidents：是否显示"现住几人"（仅 A）
 * - showFurnished：是否显示"是否带家具"（C/D）
 * - defaultFurnished：furnished 字段初始值（D 默认 true，其他 false）
 * - photoHint：照片上传的引导文案
 * - areaHint：区域字段的副标题
 */
const TYPE_META: Record<TypeId, {
  label: string;
  desc: string;
  emoji: string;
  hasPlace: boolean;
  layoutLabel: string;
  dateLabel: string;
  dateRequiredBoth: boolean;
  showMoveInFuzzy: boolean;
  showCurrentResidents: boolean;
  showFurnished: boolean;
  defaultFurnished: boolean;
  showSelfInfo: boolean;   // 是否显示"关于我（性别/年龄）" — 合租场景 true，租赁场景 false
  singleRent: boolean;     // 价格是单个金额（C/D 转租租金确定）还是区间（A/B 合租有商量空间）
  rentLabel: string;       // 价格字段的措辞
  lookingForLabel: string;
  photoHint: string;
  areaHint: string;
}> = {
  find_roommate: {
    label: '有房找室友',  desc: '有房，找一起住的人',  emoji: '🏠',
    hasPlace: true,
    layoutLabel: '户型', dateLabel: '可入住时间', dateRequiredBoth: false,
    showMoveInFuzzy: true, showCurrentResidents: true, showFurnished: false,
    defaultFurnished: false,
    showSelfInfo: true,
    singleRent: false, rentLabel: '月租预算 (USD)',
    lookingForLabel: '找谁（性别筛选基于双方自我表达）',
    photoHint: '展现品味/性格的照片：房间、宠物、爱好都行，不需要正脸',
    areaHint: '你现住的位置',
  },
  co_rent: {
    label: '找队友合租',  desc: '还没签约，找队友一起找房', emoji: '🤝',
    hasPlace: false,
    layoutLabel: '期望户型', dateLabel: '期望入住时间', dateRequiredBoth: false,
    showMoveInFuzzy: true, showCurrentResidents: false, showFurnished: false,
    defaultFurnished: false,
    showSelfInfo: true,
    singleRent: false, rentLabel: '月租预算 (USD)',
    lookingForLabel: '找谁（性别筛选基于双方自我表达）',
    photoHint: '展现品味/性格的照片：宠物、书架、爱好都行，不需要正脸',
    areaHint: '期望区域',
  },
  sublet: {
    label: '转租',        desc: 'lease 提前结束，转出去', emoji: '📅',
    hasPlace: true,
    layoutLabel: '户型', dateLabel: 'Lease 起止日期', dateRequiredBoth: true,
    showMoveInFuzzy: false, showCurrentResidents: false, showFurnished: true,
    defaultFurnished: false,
    showSelfInfo: false,
    singleRent: true, rentLabel: '月租金 (USD)',
    lookingForLabel: '对租客的性别要求',
    photoHint: '出租房间的实景图（客厅、卧室、厨房等）',
    areaHint: '房子位置',
  },
  summer: {
    label: '暑期短租',    desc: '暑假 2-3 个月空房',    emoji: '☀️',
    hasPlace: true,
    layoutLabel: '户型', dateLabel: '暑期日期', dateRequiredBoth: true,
    showMoveInFuzzy: false, showCurrentResidents: false, showFurnished: true,
    defaultFurnished: true,
    showSelfInfo: false,
    singleRent: true, rentLabel: '月租金 (USD)',
    lookingForLabel: '对租客的性别要求',
    photoHint: '出租房间的实景图（客厅、卧室、厨房等）',
    areaHint: '房子位置',
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

/** 用于编辑模式预填的最小字段集（GET /api/listings 返回的公开字段不含 contactValue） */
export type ListingEditInitial = {
  id: string;
  type: string;
  posterGender: string;
  ageRange: string | null;
  lookingForGender: string;
  title: string;
  description: string;
  photoUrls: string[];
  housingLayout: string | null;
  moveInStart: string | null;
  moveInEnd: string | null;
  moveInFuzzy?: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  areas: string[];
  currentResidents?: number | null;
  furnished?: boolean | null;
  sleepSchedule: string | null;
  cleanliness: string | null;
  social: string | null;
  smoking: string | null;
  drinking: string | null;
  pets: string | null;
  guests: string | null;
  contactType: string;
  contactValue?: string;
  customContactLabel?: string | null;
};

export function ListingPostModal({
  onClose,
  onSaved,
  mode = 'create',
  initialListing,
  initialEditCode,
}: {
  onClose: () => void;
  onSaved: () => void;
  mode?: 'create' | 'edit';
  initialListing?: ListingEditInitial;
  initialEditCode?: string;
}) {
  const isEdit = mode === 'edit' && !!initialListing;
  const [type, setType] = useState<TypeId>((initialListing?.type as TypeId) ?? 'find_roommate');

  // 自我表达
  const [posterGender, setPosterGender] = useState<string>(
    initialListing?.posterGender && initialListing.posterGender !== 'unspecified' && initialListing.posterGender !== 'nb'
      ? initialListing.posterGender
      : ''
  );
  const [ageRange, setAgeRange] = useState<string>(initialListing?.ageRange ?? '');
  const [lookingForGender, setLookingForGender] = useState<string>(initialListing?.lookingForGender ?? 'any');

  // 内容
  const [title, setTitle] = useState(initialListing?.title ?? '');
  const [description, setDescription] = useState(initialListing?.description ?? '');
  const [photoUrls, setPhotoUrls] = useState<string[]>(initialListing?.photoUrls ?? []);

  // 房屋（通用）
  const dateStr = (d: string | null | undefined) => d ? d.slice(0, 10) : '';
  const [housingLayout, setHousingLayout] = useState(initialListing?.housingLayout ?? '');
  const [moveInStart, setMoveInStart] = useState(dateStr(initialListing?.moveInStart));
  const [moveInEnd, setMoveInEnd] = useState(dateStr(initialListing?.moveInEnd));
  const [moveInFuzzy, setMoveInFuzzy] = useState(initialListing?.moveInFuzzy ?? '');
  const [budgetMin, setBudgetMin] = useState(initialListing?.budgetMin?.toString() ?? '');
  const [budgetMax, setBudgetMax] = useState(initialListing?.budgetMax?.toString() ?? '');
  // Sprint 6.7j:areas 拆分为"预定义 chips + 自定义输入"
  //   - 老 listing 里的 areas 可能含非预定义字符串(以前的自定义)
  //   - 处理:那些字符串去掉,改为 ['其他'] 标记(chip 激活),自定义输入默认空白(per Sean)
  const initialAreasRaw = initialListing?.areas ?? [];
  const initialPredefined = initialAreasRaw.filter(a => (LISTING_AREAS as readonly string[]).includes(a));
  const initialHadCustom = initialAreasRaw.some(a => !(LISTING_AREAS as readonly string[]).includes(a));
  const initialAreasState =
    initialHadCustom && !initialPredefined.includes('其他')
      ? [...initialPredefined, '其他']
      : initialPredefined;
  const [areas, setAreas] = useState<string[]>(initialAreasState);
  const [customArea, setCustomArea] = useState<string>(''); // 默认空白

  // 类型特有
  const [currentResidents, setCurrentResidents] = useState(initialListing?.currentResidents?.toString() ?? '');
  const [furnished, setFurnished] = useState(!!initialListing?.furnished);

  // 生活方式
  const [showLifestyle, setShowLifestyle] = useState(false);
  const [lifestyle, setLifestyle] = useState<Record<string, string>>(() => ({
    sleepSchedule: initialListing?.sleepSchedule ?? '',
    cleanliness:   initialListing?.cleanliness ?? '',
    social:        initialListing?.social ?? '',
    smoking:       initialListing?.smoking ?? '',
    drinking:      initialListing?.drinking ?? '',
    pets:          initialListing?.pets ?? '',
    guests:        initialListing?.guests ?? '',
  }));

  // 联系方式
  const [contactType, setContactType] = useState<string>(initialListing?.contactType ?? 'wechat');
  const [contactValue, setContactValue] = useState(initialListing?.contactValue ?? '');
  const [customLabel, setCustomLabel] = useState(initialListing?.customContactLabel ?? '');

  const [editCode, setEditCode] = useState(initialEditCode ?? '');
  const [submitting, setSubmitting] = useState(false);

  // 创建模式：从 localStorage 预填联系方式 + 密码
  // 编辑模式：上面已经从 initialListing/initialEditCode 取了，不覆盖
  useEffect(() => {
    if (isEdit) return;
    try {
      const tp = localStorage.getItem(LS_LAST_CONTACT_T);
      const v  = localStorage.getItem(LS_LAST_CONTACT_V);
      const c  = localStorage.getItem(LS_LAST_CODE);
      if (tp === 'wechat' || tp === 'phone' || tp === 'email' || tp === 'other') setContactType(tp);
      if (v) setContactValue(v);
      if (c) setEditCode(c);
    } catch {}
  }, [isEdit]);

  const meta = TYPE_META[type];

  // 类型切换时：清理不属于当前类型的字段 + 应用默认值（特别是 D 的 furnished=true）
  // 注意：编辑模式下初次挂载不能跑（否则会用 type 默认值覆盖 initialListing 的真实值）
  const skipTypeEffect = useRef(isEdit);
  useEffect(() => {
    if (skipTypeEffect.current) {
      skipTypeEffect.current = false;
      return;
    }
    if (!meta.showMoveInFuzzy) setMoveInFuzzy('');
    if (!meta.showCurrentResidents) setCurrentResidents('');
    if (meta.showFurnished) {
      setFurnished(meta.defaultFurnished);
    } else {
      setFurnished(false);
    }
    if (!meta.showSelfInfo) {
      setPosterGender('');
      setAgeRange('');
    }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleArea = (a: string) => {
    setAreas(curr => curr.includes(a) ? curr.filter(x => x !== a) : [...curr, a]);
  };

  const submit = async () => {
    // 合租场景必选性别；租赁场景房东性别无关，不强制
    if (meta.showSelfInfo && !posterGender) return showError('请选择你的性别');
    if (!title.trim()) return showError('标题不能为空');
    if (!contactValue.trim()) return showError('联系方式不能为空');
    if (editCode.length < 6) return showError('密码至少 6 位');
    if (meta.dateRequiredBoth && (!moveInStart || !moveInEnd)) {
      return showError(`${meta.dateLabel}：起止日期都必填`);
    }
    if (meta.showCurrentResidents && currentResidents !== '') {
      const n = Number(currentResidents);
      if (!Number.isFinite(n) || n < 0 || n > 20) return showError('"现住几人"应为 0–20');
    }

    const payload = {
      type,
      // 租赁场景房东性别/年龄不发表，统一打 unspecified（DB 仍接受历史值）
      posterGender: meta.showSelfInfo ? posterGender : 'unspecified',
      ageRange: meta.showSelfInfo ? (ageRange || null) : null,
      lookingForGender,
      title: title.trim(),
      description: description.trim(),
      photoUrls,
      hasPlace: meta.hasPlace,
      housingLayout: housingLayout.trim() || null,
      moveInStart: moveInStart || null,
      moveInEnd: moveInEnd || null,
      moveInFuzzy: meta.showMoveInFuzzy ? (moveInFuzzy || null) : null,
      budgetMin: budgetMin === '' ? null : Number(budgetMin),
      budgetMax: budgetMax === '' ? null : Number(budgetMax),
      // Sprint 6.7j:如果选了"其他"且填了自定义文本,提交时把"其他"替换为自定义文本
      areas: (() => {
        const trimmed = customArea.trim();
        if (areas.includes('其他') && trimmed) {
          return areas.map(a => (a === '其他' ? trimmed : a));
        }
        return areas;
      })(),
      currentResidents: meta.showCurrentResidents && currentResidents !== ''
        ? Number(currentResidents)
        : null,
      furnished: meta.showFurnished ? furnished : null,
      ...lifestyle,
      contactType,
      contactValue: contactValue.trim(),
      customContactLabel: contactType === 'other' ? (customLabel.trim() || null) : null,
      editCode,
      utmSource: getStoredUtmSource(),
    };

    setSubmitting(true);
    try {
      const url    = isEdit ? `/api/listings/${initialListing!.id}` : '/api/listings';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || (isEdit ? '保存失败' : '发布失败')); return; }
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
      <div className="bg-white w-full max-w-2xl sm:rounded-card min-h-screen sm:min-h-0 my-0 sm:my-4">

        <div className="sticky top-0 z-10 bg-white border-b border-stone-200 px-5 py-3 flex items-center gap-2 sm:rounded-t-card">
          {!isEdit && <Plus size={20} className="text-brand" />}
          <h2 className="text-lg font-semibold text-stone-900">{isEdit ? '编辑室友/转租' : '发布室友/转租'}</h2>
          <button onClick={onClose} className="ml-auto p-1 rounded-full hover:bg-stone-100" aria-label="关闭"><X size={22} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* 1. 类型 —— 编辑模式只显示当前类型，禁止切换（切换会乱字段语义） */}
          <section>
            <Label required>这是哪种？</Label>
            {isEdit ? (
              <div className="p-3 rounded-lg border border-stone-300 bg-stone-50 text-sm">
                <span className="font-semibold">{meta.emoji} {meta.label}</span>
                <span className="text-xs text-stone-500 ml-2">（编辑时无法更改类型）</span>
              </div>
            ) : (
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
            )}
          </section>

          {/* 2. 自我表达（仅合租场景显示；租赁场景房东个人信息无关） */}
          <section className="space-y-3">
            {meta.showSelfInfo && (
              <>
                <Label>关于我（公开展示，方便对方了解你）</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Sub>我是 <span className="text-brand">*</span></Sub>
                    <Pills
                      value={posterGender}
                      onChange={setPosterGender}
                      options={LISTING_GENDERS_UI.map(g => ({ v: g.v, l: g.l }))}
                    />
                  </div>
                  <div>
                    <Sub>年龄段</Sub>
                    <Pills value={ageRange} onChange={setAgeRange} options={[
                      { v: '', l: '不填' },
                      ...LISTING_AGE_RANGES.map(r => ({ v: r, l: r })),
                    ]} />
                  </div>
                </div>
              </>
            )}
            <div>
              <Sub>{meta.lookingForLabel}</Sub>
              <Pills value={lookingForGender} onChange={setLookingForGender} options={[
                { v: 'any',    l: '不限性别' },
                { v: 'F-only', l: meta.showSelfInfo ? '仅女生' : '仅女生租客' },
                { v: 'M-only', l: meta.showSelfInfo ? '仅男生' : '仅男生租客' },
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
                placeholder={
                  type === 'find_roommate' ? '例：研一妹子找 9 月入住女室友' :
                  type === 'co_rent'       ? '例：男生求一起找 2B1B 室友' :
                  type === 'sublet'        ? '例：5/15–8/15 转租 1B1B' :
                                              '例：暑期 2 个月转租，5/20–7/30'
                }
                className="w-full border border-stone-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <Label>详细介绍</Label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder={
                  type === 'find_roommate' || type === 'co_rent'
                    ? '可写：自我介绍、希望对方的性格、生活习惯、为什么找室友等'
                    : '可写：户型细节、家具配置、邻居环境、转租原因等'
                }
                className="w-full border border-stone-300 rounded-md px-3 py-2 leading-relaxed"
              />
            </div>
          </section>

          {/* 4. 照片（提示语随类型变化） */}
          <section>
            <Label>照片</Label>
            <p className="text-xs text-stone-500 mb-2">{meta.photoHint}</p>
            <ImageUpload urls={photoUrls} onChange={setPhotoUrls} />
          </section>

          {/* 5. 房屋字段（类型相关） */}
          <section className="space-y-3 bg-stone-50 rounded-lg p-3 border border-stone-200">
            <div className="text-xs text-stone-500 uppercase font-semibold">
              {meta.hasPlace ? '关于房子' : '关于你想找的房子'}
            </div>

            <div>
              <Sub>{meta.layoutLabel}</Sub>
              <input
                value={housingLayout}
                onChange={e => setHousingLayout(e.target.value)}
                placeholder="例：1B1B / 2B1B / Studio"
                className="w-full border border-stone-300 rounded-md px-3 py-2"
              />
            </div>

            {/* A: 现住几人（你将加入 N 人） */}
            {meta.showCurrentResidents && (
              <div>
                <Sub>你将加入几人（含房东 / 其他室友）</Sub>
                <input
                  type="number" inputMode="numeric" min={0} max={20}
                  value={currentResidents}
                  onChange={e => setCurrentResidents(e.target.value)}
                  placeholder="例：2"
                  className="w-32 border border-stone-300 rounded-md px-3 py-2"
                />
                <span className="ml-2 text-xs text-stone-500">人</span>
              </div>
            )}

            {/* C/D: 是否带家具 */}
            {meta.showFurnished && (
              <div>
                <Sub>家具</Sub>
                <label className="inline-flex items-center gap-2 px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={furnished}
                    onChange={e => setFurnished(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-stone-700">带家具（furnished）</span>
                </label>
              </div>
            )}

            {/* A/B: 模糊入住时间 chips */}
            {meta.showMoveInFuzzy && (
              <div>
                <Sub>{meta.dateLabel}</Sub>
                <Pills
                  value={moveInFuzzy}
                  onChange={setMoveInFuzzy}
                  options={[
                    { v: '', l: '不填' },
                    ...LISTING_MOVEIN_FUZZY.map(x => ({ v: x.v, l: x.l })),
                  ]}
                />
                <details className="mt-2">
                  <summary className="text-xs text-stone-500 cursor-pointer hover:text-stone-700">
                    或填具体日期范围（可选）
                  </summary>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="date"
                      value={moveInStart}
                      onChange={e => setMoveInStart(e.target.value)}
                      className="flex-1 border border-stone-300 rounded-md px-3 py-2"
                    />
                    <span className="text-stone-400">至</span>
                    <input
                      type="date"
                      value={moveInEnd}
                      onChange={e => setMoveInEnd(e.target.value)}
                      className="flex-1 border border-stone-300 rounded-md px-3 py-2"
                    />
                  </div>
                </details>
              </div>
            )}

            {/* C/D: 具体日期（必填） */}
            {meta.dateRequiredBoth && (
              <div>
                <Sub>{meta.dateLabel} <span className="text-brand">*</span></Sub>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={moveInStart}
                    onChange={e => setMoveInStart(e.target.value)}
                    className="flex-1 border border-stone-300 rounded-md px-3 py-2"
                  />
                  <span className="text-stone-400">至</span>
                  <input
                    type="date"
                    value={moveInEnd}
                    onChange={e => setMoveInEnd(e.target.value)}
                    className="flex-1 border border-stone-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
            )}

            <div>
              <Sub>{meta.rentLabel}</Sub>
              {meta.singleRent ? (
                // C/D 转租 + 暑期：单个金额输入，submit 时把同样的值塞 budgetMin/Max
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-stone-500">$</span>
                  <input
                    type="number" inputMode="numeric" min={0}
                    value={budgetMin}
                    onChange={e => {
                      setBudgetMin(e.target.value);
                      setBudgetMax(e.target.value);
                    }}
                    placeholder="例：800"
                    className="w-28 border border-stone-300 rounded-md px-2 py-2"
                  />
                  <span className="text-stone-500 text-sm">/月</span>
                </div>
              ) : (
                // A/B 合租：区间，有商量空间
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-stone-500">$</span>
                  <input
                    type="number" inputMode="numeric" min={0}
                    value={budgetMin}
                    onChange={e => setBudgetMin(e.target.value)}
                    placeholder="下限"
                    className="w-24 border border-stone-300 rounded-md px-2 py-2"
                  />
                  <span className="text-stone-400">—</span>
                  <span className="text-stone-500">$</span>
                  <input
                    type="number" inputMode="numeric" min={0}
                    value={budgetMax}
                    onChange={e => setBudgetMax(e.target.value)}
                    placeholder="上限"
                    className="w-24 border border-stone-300 rounded-md px-2 py-2"
                  />
                  <span className="text-stone-500 text-sm">/月</span>
                </div>
              )}
            </div>

            <div>
              <Sub>{meta.areaHint}（可多选）</Sub>
              <div className="flex flex-wrap gap-1.5">
                {LISTING_AREAS.map(a => {
                  const active = areas.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleArea(a)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
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
              {/* Sprint 6.7j:点了"其他"chip 才出现自定义输入 */}
              {areas.includes('其他') && (
                <input
                  value={customArea}
                  onChange={e => setCustomArea(e.target.value)}
                  maxLength={30}
                  placeholder="例:Patrick Henry Drive / 某个具体街区名"
                  className="mt-2 w-full border border-stone-300 rounded-md px-3 py-2 text-sm"
                />
              )}
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

          {/* 7. 联系方式 + 密码 */}
          <section className="space-y-3 bg-stone-50 rounded-lg p-3 border border-stone-200">
            <div className="text-xs text-stone-500 uppercase font-semibold">联系方式</div>
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
              💡 你的联系方式 <strong>默认隐藏</strong>，只在你同意某个申请人后，才双向可见
            </div>
            <div className="flex gap-2">
              <select
                value={contactType}
                onChange={e => setContactType(e.target.value)}
                className="border border-stone-300 rounded-md px-2 py-2"
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
                onBlur={() => {
                  const r = validateContact(contactType, contactValue);
                  if (!r.ok && r.warning) showWarning(r.warning);
                }}
                placeholder={contactPlaceholder(contactType)}
                className="flex-1 border border-stone-300 rounded-md px-3 py-2"
              />
              {contactType === 'other' && (
                <input
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  placeholder="标签"
                  className="w-24 border border-stone-300 rounded-md px-2 py-2"
                />
              )}
            </div>
          </section>

          <section>
            <Label required>密码</Label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editCode}
                onChange={e => setEditCode(e.target.value)}
                minLength={6}
                placeholder="例：myroom123"
                className="flex-1 min-w-0 border border-stone-300 rounded-md px-3 py-2 font-mono"
              />
              {editCode.length >= 6 && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(editCode);
                      showSuccess('密码已复制');
                    } catch {
                      showError('复制失败,请手动选中');
                    }
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium bg-stone-100 text-stone-700 rounded-md hover:bg-stone-200 flex-shrink-0"
                  title="复制密码"
                >
                  <Copy size={12} />
                  复制
                </button>
              )}
            </div>
            <div className="text-xs text-stone-600 mt-1.5 leading-relaxed">
              ⚠️ "联系方式 + 密码" = 你管理这条发布的凭证。改 / 删 / 查"我的"都要用。<br />
              我们加密保存,自己也看不到 —— <strong>丢了无法找回</strong>,但可以凭联系方式申请人工找回。
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-stone-200 px-5 py-3 flex justify-end gap-2 sm:rounded-b-card">
          <button onClick={onClose} className="px-6 py-2 border border-stone-300 bg-white text-stone-700 rounded-full hover:bg-stone-50 transition-colors font-medium">
            取消
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-6 py-2 bg-brand text-white rounded-full hover:bg-brand-dark disabled:opacity-50 font-medium transition-colors"
          >
            {submitting ? (isEdit ? '保存中…' : '发布中…') : (isEdit ? '保存' : '发布')}
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
          className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
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
