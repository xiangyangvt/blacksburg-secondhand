'use client';

// 室友 listing 卡片
// 设计：扁平、信息密度高、申请联系是主 CTA
// 沿用二手 ItemCard 的视觉语法（小圆点类目色、新鲜度 badge 等）

import { useState } from 'react';
import NextImage from 'next/image';
import { Mail, Calendar, MapPin } from 'lucide-react';
import {
  LISTING_TYPES,
  LISTING_AREAS,
  LIFESTYLE_DIMS,
  freshnessBadge,
} from '@/lib/utils';

export type Listing = {
  id: string;
  type: string;
  posterGender: string;
  ageRange: string | null;
  lookingForGender: string;
  title: string;
  description: string;
  photoUrls: string[];
  hasPlace: boolean;
  housingLayout: string | null;
  moveInStart: string | null;
  moveInEnd: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  areas: string[];
  sleepSchedule: string | null;
  cleanliness: string | null;
  social: string | null;
  smoking: string | null;
  drinking: string | null;
  pets: string | null;
  guests: string | null;
  contactType: string;
  createdAt: string;
  bumpedAt?: string;
};

const TYPE_COLOR: Record<string, { chip: string; dot: string }> = {
  find_roommate: { chip: 'bg-blue-50   text-blue-700   border-blue-200',   dot: 'bg-blue-500'   },
  co_rent:       { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  sublet:        { chip: 'bg-amber-50  text-amber-700  border-amber-200',  dot: 'bg-amber-500'  },
  summer:        { chip: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
};

const GENDER_LABEL: Record<string, string> = {
  F: 'F女', M: 'M男', nb: '非二元', unspecified: '未透露',
};

const LIFESTYLE_LABEL: Record<string, Record<string, string>> = {
  sleepSchedule: { early: '早睡', late: '晚睡', flexible: '作息灵活' },
  cleanliness:   { neat: '整洁', average: '一般', casual: '随性' },
  social:        { quiet: '安静', occasional: '偶尔聚会', frequent: '常聚会' },
  smoking:       { no: '不吸烟', ok: '接受烟', yes: '吸烟' },
  drinking:      { no: '不喝酒', occasional: '偶尔喝', frequent: '常喝' },
  pets:          { none: '无宠物', cat: '有猫', dog: '有狗', other: '其他宠物' },
  guests:        { no: '不接受过夜', occasional: '偶尔过夜 OK', ok: '过夜 OK' },
};

function formatDateRange(s: string | null, e: string | null): string {
  if (!s && !e) return '';
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  if (s && e) return `${fmt(s)} – ${fmt(e)}`;
  if (s) return `${fmt(s)} 起`;
  return `至 ${fmt(e!)}`;
}

function formatBudget(min: number | null, max: number | null): string {
  if (min === null && max === null) return '面议';
  if (min !== null && max !== null && min === max) return `$${min}/月`;
  if (min !== null && max !== null) return `$${min}–${max}/月`;
  if (min !== null) return `$${min}+/月`;
  return `≤$${max}/月`;
}

export function ListingCard({
  listing,
  onApply,
}: {
  listing: Listing;
  onApply: (l: Listing) => void;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const typeMeta = LISTING_TYPES.find(t => t.id === listing.type);
  const typeColor = TYPE_COLOR[listing.type] ?? TYPE_COLOR.find_roommate;
  const fresh = freshnessBadge(listing.bumpedAt ?? listing.createdAt, 'zh');

  // 收集 active 生活方式 chips
  const lifestyleChips: string[] = [];
  for (const k of Object.keys(LIFESTYLE_DIMS)) {
    const v = (listing as any)[k];
    if (v && LIFESTYLE_LABEL[k]?.[v]) lifestyleChips.push(LIFESTYLE_LABEL[k][v]);
  }

  const photos = Array.isArray(listing.photoUrls) ? listing.photoUrls : [];

  return (
    <article className="bg-white rounded-card shadow-card border border-stone-200 overflow-hidden hover:shadow-card-hover transition-shadow">
      {/* 图片区 */}
      {photos.length > 0 && (
        <div className="relative">
          <div className="aspect-[4/3] bg-stone-100 relative">
            <NextImage
              src={photos[imgIdx]}
              alt={listing.title}
              fill
              sizes="(max-width:768px) 100vw, 50vw"
              className="object-cover"
            />
            {photos.length > 1 && (
              <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                {imgIdx + 1}/{photos.length}
              </div>
            )}
          </div>
          {photos.length > 1 && (
            <div className="flex gap-1 px-2 py-1 overflow-x-auto no-scrollbar bg-stone-50">
              {photos.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setImgIdx(i)}
                  className={`flex-shrink-0 w-12 h-12 rounded overflow-hidden border-2 transition-colors ${
                    i === imgIdx ? 'border-brand' : 'border-transparent opacity-70'
                  }`}
                >
                  <NextImage src={url} alt="" width={48} height={48} sizes="48px" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-3 md:p-4">
        {/* 头部：类型 / 性别 / 新鲜度 */}
        <div className="flex items-center gap-1.5 text-xs mb-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${typeColor.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${typeColor.dot}`} />
            {typeMeta?.label ?? listing.type}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
            {GENDER_LABEL[listing.posterGender] ?? listing.posterGender}
            {listing.ageRange && ` · ${listing.ageRange}`}
          </span>
          <span className={`ml-auto whitespace-nowrap ${fresh.className}`}>
            {fresh.label}
          </span>
        </div>

        {/* 标题 */}
        <h3 className="text-base md:text-lg font-semibold text-stone-900 leading-tight mb-1 line-clamp-2">
          {listing.title}
        </h3>

        {/* 预算（醒目） */}
        <div className="text-lg md:text-xl font-bold text-brand mb-2">
          {formatBudget(listing.budgetMin, listing.budgetMax)}
        </div>

        {/* 描述 (line clamp 3 行) */}
        {listing.description && (
          <p className="text-sm text-stone-700 mb-2 line-clamp-3 whitespace-pre-wrap">
            {listing.description}
          </p>
        )}

        {/* 元信息行：入住时间 + 户型 + 区域 */}
        <div className="flex items-center gap-3 text-xs text-stone-500 mb-2 flex-wrap">
          {(listing.moveInStart || listing.moveInEnd) && (
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} />
              {formatDateRange(listing.moveInStart, listing.moveInEnd)}
            </span>
          )}
          {listing.housingLayout && (
            <span>{listing.housingLayout}</span>
          )}
          {listing.areas.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} />
              {listing.areas.join(' · ')}
            </span>
          )}
        </div>

        {/* 生活方式 chips */}
        {lifestyleChips.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {lifestyleChips.map((c, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[11px]"
              >
                {c}
              </span>
            ))}
          </div>
        )}

        {/* 找谁 + 申请联系 */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-100">
          <div className="text-xs text-stone-500">
            {listing.lookingForGender === 'F-only' ? '仅找 F'
              : listing.lookingForGender === 'M-only' ? '仅找 M'
              : '不限性别'}
          </div>
          <button
            onClick={() => onApply(listing)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-chip text-sm font-medium hover:bg-brand-dark active:scale-95 transition-all shadow-card"
          >
            <Mail size={14} />
            申请联系
          </button>
        </div>
      </div>
    </article>
  );
}
