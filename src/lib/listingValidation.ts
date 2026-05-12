// 室友 listing 字段校验（创建 + 编辑共用）

import {
  LISTING_TYPES, LISTING_AREAS, LISTING_GENDERS, LISTING_LOOKING_FOR,
  LISTING_AGE_RANGES, LIFESTYLE_DIMS, CONTACT_TYPES,
} from './utils';

const VALID_TYPES        = LISTING_TYPES.map(t => t.id);
const VALID_AREAS        = LISTING_AREAS as readonly string[];
const VALID_GENDERS      = LISTING_GENDERS as readonly string[];
const VALID_LOOKING_FOR  = LISTING_LOOKING_FOR as readonly string[];
const VALID_AGE_RANGES   = LISTING_AGE_RANGES as readonly string[];
const VALID_CONTACT_TYPES = CONTACT_TYPES.map(c => c.id);

/** 返回错误字符串或 null（合法） */
export function validateListingFields(f: any): string | null {
  if (!VALID_TYPES.includes(f.type)) return '类型不合法';
  if (typeof f.title !== 'string' || !f.title.trim()) return '标题不能为空';
  if (f.title.length > 100) return '标题最多 100 字';
  if (typeof f.description !== 'string' || f.description.length > 2000) return '描述最多 2000 字';

  if (f.posterGender !== undefined && !VALID_GENDERS.includes(f.posterGender)) return '性别不合法';
  if (f.lookingForGender !== undefined && !VALID_LOOKING_FOR.includes(f.lookingForGender)) return '希望对方不合法';
  if (f.ageRange !== undefined && f.ageRange !== null && f.ageRange !== '' && !VALID_AGE_RANGES.includes(f.ageRange)) {
    return '年龄段不合法';
  }

  if (!VALID_CONTACT_TYPES.includes(f.contactType)) return '联系方式类型不合法';
  if (typeof f.contactValue !== 'string' || !f.contactValue.trim()) return '联系方式不能为空';

  if (!Array.isArray(f.photoUrls) || f.photoUrls.length > 6) return '图片最多 6 张';

  // 房屋字段
  if (f.budgetMin !== undefined && f.budgetMin !== null && (typeof f.budgetMin !== 'number' || f.budgetMin < 0)) return '预算下限不合法';
  if (f.budgetMax !== undefined && f.budgetMax !== null && (typeof f.budgetMax !== 'number' || f.budgetMax < 0)) return '预算上限不合法';
  if (f.budgetMin && f.budgetMax && f.budgetMin > f.budgetMax) return '预算下限大于上限';

  if (f.areas !== undefined) {
    if (!Array.isArray(f.areas)) return '区域格式不合法';
    for (const a of f.areas) {
      if (!VALID_AREAS.includes(a)) return `区域不合法: ${a}`;
    }
  }

  // 生活方式 dims（每个都可选）
  for (const [k, opts] of Object.entries(LIFESTYLE_DIMS)) {
    const v = f[k];
    if (v !== undefined && v !== null && v !== '' && !(opts as readonly string[]).includes(v)) {
      return `${k} 不合法`;
    }
  }

  return null;
}

/** 把传入字段标准化（trim、空字符串转 null 等），返回可直接 spread 给 prisma 的 data 对象 */
export function normalizeListingFields(f: any) {
  return {
    type:               f.type,
    posterGender:       f.posterGender ?? 'unspecified',
    ageRange:           f.ageRange?.trim() || null,
    lookingForGender:   f.lookingForGender ?? 'any',
    title:              f.title.trim(),
    description:        (f.description ?? '').trim(),
    photoUrls:          JSON.stringify(f.photoUrls ?? []),
    hasPlace:           !!f.hasPlace,
    housingLayout:      f.housingLayout?.trim() || null,
    moveInStart:        f.moveInStart ? new Date(f.moveInStart) : null,
    moveInEnd:          f.moveInEnd   ? new Date(f.moveInEnd)   : null,
    budgetMin:          f.budgetMin === null || f.budgetMin === undefined || f.budgetMin === '' ? null : Math.round(Number(f.budgetMin)),
    budgetMax:          f.budgetMax === null || f.budgetMax === undefined || f.budgetMax === '' ? null : Math.round(Number(f.budgetMax)),
    areas:              JSON.stringify(Array.isArray(f.areas) ? f.areas : []),
    sleepSchedule:      f.sleepSchedule || null,
    cleanliness:        f.cleanliness   || null,
    social:             f.social        || null,
    smoking:            f.smoking       || null,
    drinking:           f.drinking      || null,
    pets:               f.pets          || null,
    guests:             f.guests        || null,
    contactType:        f.contactType,
    contactValue:       f.contactValue.trim(),
    customContactLabel: f.customContactLabel?.trim() || null,
  };
}
