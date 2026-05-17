'use client';

// Sprint 7 Phase 1.7+:本地事件卡片(/localnews 用)— 双态版
// - 紧凑(mobile 默认): 封面 + 类型 chip + 标题 + 时间(占 1 col)
// - 展开:col-span-2 md:col-span-1 占满整行,显示完整描述 + 原标题 + "查看原站" 按钮
// - 跟 ListingCard / ItemCard 同款交互:点卡片空白处 toggle,按钮/链接不触发
//
// 图片渲染:用普通 <img>(不用 NextImage)— 11 个抓取源就 11+ 个域名,挨个白名单不现实;
// 这些都是 thumbnail 不需要 next 优化;onError 失败时 fallback 到类型色占位

import { useState, useRef, useEffect } from 'react';
import {
  Calendar, MapPin, ExternalLink, Clock, Heart, Flame, Send,
  // Phase 3B 类目 Lucide icon(替代 emoji,UI 高级感)
  Utensils, Dumbbell, BookOpen, Trophy, Sparkles, MessageCircle,
  // Phase 3B 响应数 + 状态 badge
  Users, CheckCircle2, XCircle, Hourglass,
  // Phase 3C 简笔 placeholder 装饰 icon
  Coffee, ChefHat, Activity, Lightbulb, GraduationCap, Medal, Flag,
  // Phase 3C MoreMenu(修改/删除/举报)
  Pencil, Trash2,
} from 'lucide-react';
import { MoreMenu, type MoreMenuItem } from './MoreMenu';
import type { LucideIcon } from 'lucide-react';
import { isEventSaved, toggleSavedEvent, subscribeSavedEvents } from '@/lib/savedEvents';
import { showSuccess, showWarning } from '@/lib/toast';
import { parseLocation } from '@/lib/eventLocation';
import { EventCommentSection } from './EventCommentSection';
import { ContactSendModal } from './ContactSendModal';
import { ShareToWechatButton } from './ShareToWechatButton';

export type EventCardData = {
  id: string;
  source: string;
  sourceUrl: string;
  title: string;
  titleOriginal: string | null;
  description: string | null;
  startAt: string | Date | null;
  endAt: string | Date | null;
  publishedAt: string | Date | null;  // news/discussion 类用这个排序 + 展示
  location: string | null;
  category: string | null;
  imageUrl: string | null;
  // Phase 2A:热度跟踪
  clickCount?: number;
  scrapedAt?: string | Date | null;
  // Phase 3A:用户发布字段(scraped events 全 null)
  customCategory?: string | null;
  posterNickname?: string | null;
  posterContactType?: string | null;
  posterContact?: string | null;
  posterContactLabel?: string | null;
  posterContactPublic?: boolean | null;
  photoUrls?: string[];
  // Phase 3B:Event 通用化
  maxAttendees?: number | null;
  status?: string;                  // active | fulfilled | canceled | expired | hidden | deleted
  responseCount?: number;           // EventContactSend 中 status != canceled 的数(server 注入)
};

// Phase 2A:热度梯度。clicks/hour 阈值。
// 设计:新鲜内容(scrape 1 小时内 1 次点击就 = 1.0 clicks/hr → 高热)
// 老内容需要更多 clicks 才能上热度,自然降权
// double:渲染 2 个 Flame icon(高热)
const HEAT_LEVELS = [
  { min: 5,   color: 'text-rose-600',   fill: true,  double: true  },
  { min: 1.5, color: 'text-rose-500',   fill: true,  double: false },
  { min: 0.5, color: 'text-orange-500', fill: false, double: false },
] as const;

function getHeatLevel(clickCount: number | undefined, scrapedAt: string | Date | null | undefined) {
  if (!clickCount || clickCount < 1) return null;
  const scraped = scrapedAt ? new Date(scrapedAt).getTime() : Date.now() - 24 * 3600e3;
  const ageH = Math.max(1, (Date.now() - scraped) / 3600e3);
  const heat = clickCount / ageH;
  for (const lv of HEAT_LEVELS) if (heat >= lv.min) return lv;
  return null;
}

// Phase 3A.1: 类别 rename — events→life, sports→competition + 新 exercise/academic
const CATEGORY_LABEL: Record<string, string> = {
  life:        '生活',
  exercise:    '运动',
  academic:    '学术',
  competition: '比赛',
  discussion:  '讨论',
  other:       '其他',
  // 旧 ID 兜底(防止有 stale 数据)
  events: '生活',
  sports: '比赛',
  news:   '讨论',
};

// Phase 3B: 类目 Lucide icon — 替代 emoji,UI 高级感更强
// emoji 字典只在 share text(复制到微信群)里保留,因为微信只能渲染 emoji
const CATEGORY_ICON: Record<string, LucideIcon> = {
  life:        Utensils,        // 生活/聚餐
  exercise:    Dumbbell,        // 运动
  academic:    BookOpen,        // 学术
  competition: Trophy,          // 比赛
  discussion:  MessageCircle,   // 讨论(已砍但兜底)
  other:       Sparkles,        // 其他
  events:      Utensils,        // 旧
  sports:      Trophy,          // 旧
  news:        MessageCircle,   // 旧
};

// Phase 3C 类目色重新设计:5 类目色相分散(amber/green/purple/blue/slate),底色淡 / 字色深,对比度 ≥ AA
// - chipBg/chipText:scrape 白底卡片上的 chip 配色
// - chipOnTintBg/chipOnTintText:UGC tint 卡片上 chip 用白底 + 类目深字(防 chip 和 tint 融成一片)
// - imgBg/imgIconColor:无图占位区底色 + 主 icon 颜色(scrape 和 UGC 都用)
// - tintBg:UGC 卡片文字区背景(非图区,scrape 不用)
// - decoColor:占位区角落装饰 icon 颜色(同 imgIconColor 但透明度低)
// - avatarBg:展开态首字母圆圈头像背景(用类目深色)
const CATEGORY_COLOR: Record<string, {
  chipBg: string; chipText: string;
  chipOnTintBg: string; chipOnTintText: string;
  imgBg: string; imgIconColor: string;
  tintBg: string;
  avatarBg: string;
}> = {
  life: {
    chipBg: 'bg-amber-100', chipText: 'text-amber-800',
    chipOnTintBg: 'bg-white', chipOnTintText: 'text-amber-800',
    imgBg: 'bg-amber-50', imgIconColor: 'text-amber-600',
    tintBg: 'bg-amber-50', avatarBg: 'bg-amber-700',
  },
  exercise: {
    chipBg: 'bg-green-100', chipText: 'text-green-800',
    chipOnTintBg: 'bg-white', chipOnTintText: 'text-green-800',
    imgBg: 'bg-green-50', imgIconColor: 'text-green-600',
    tintBg: 'bg-green-50', avatarBg: 'bg-green-700',
  },
  academic: {
    chipBg: 'bg-purple-100', chipText: 'text-purple-800',
    chipOnTintBg: 'bg-white', chipOnTintText: 'text-purple-800',
    imgBg: 'bg-purple-50', imgIconColor: 'text-purple-600',
    tintBg: 'bg-purple-50', avatarBg: 'bg-purple-700',
  },
  competition: {
    chipBg: 'bg-blue-100', chipText: 'text-blue-800',
    chipOnTintBg: 'bg-white', chipOnTintText: 'text-blue-800',
    imgBg: 'bg-blue-50', imgIconColor: 'text-blue-600',
    tintBg: 'bg-blue-50', avatarBg: 'bg-blue-700',
  },
  other: {
    chipBg: 'bg-slate-100', chipText: 'text-slate-800',
    chipOnTintBg: 'bg-white', chipOnTintText: 'text-slate-800',
    imgBg: 'bg-slate-50', imgIconColor: 'text-slate-600',
    tintBg: 'bg-slate-50', avatarBg: 'bg-slate-700',
  },
  // discussion 已砍但兜底
  discussion: {
    chipBg: 'bg-slate-100', chipText: 'text-slate-800',
    chipOnTintBg: 'bg-white', chipOnTintText: 'text-slate-800',
    imgBg: 'bg-slate-50', imgIconColor: 'text-slate-600',
    tintBg: 'bg-slate-50', avatarBg: 'bg-slate-700',
  },
  // 旧 ID 兜底
  events: {
    chipBg: 'bg-amber-100', chipText: 'text-amber-800',
    chipOnTintBg: 'bg-white', chipOnTintText: 'text-amber-800',
    imgBg: 'bg-amber-50', imgIconColor: 'text-amber-600',
    tintBg: 'bg-amber-50', avatarBg: 'bg-amber-700',
  },
  sports: {
    chipBg: 'bg-blue-100', chipText: 'text-blue-800',
    chipOnTintBg: 'bg-white', chipOnTintText: 'text-blue-800',
    imgBg: 'bg-blue-50', imgIconColor: 'text-blue-600',
    tintBg: 'bg-blue-50', avatarBg: 'bg-blue-700',
  },
  news: {
    chipBg: 'bg-slate-100', chipText: 'text-slate-800',
    chipOnTintBg: 'bg-white', chipOnTintText: 'text-slate-800',
    imgBg: 'bg-slate-50', imgIconColor: 'text-slate-600',
    tintBg: 'bg-slate-50', avatarBg: 'bg-slate-700',
  },
};

// Phase 3C: 无图占位区角落装饰 icon(对角 2 个,opacity 18%,营造"简笔设计"感)
const CATEGORY_DECO: Record<string, [LucideIcon, LucideIcon]> = {
  life:        [Coffee, ChefHat],
  exercise:    [Activity, Medal],
  academic:    [Lightbulb, GraduationCap],
  competition: [Medal, Flag],
  other:       [MapPin, Heart],
  // 兼容
  discussion:  [MessageCircle, Sparkles],
  events:      [Coffee, ChefHat],
  sports:      [Medal, Flag],
  news:        [MessageCircle, Sparkles],
};

/** 紧凑端相对时间:
 *  - 活动/体育(future-based): "今天 19:00" / "明天" / "3 天后 5/20" / "5/22 周五"
 *  - 新闻/讨论(past-based):   "30 分钟前" / "3 小时前" / "昨天 14:30" / "3 天前" / "5/13 周日"
 *
 *  注:不用"即将开始"那种含糊短语(Sean 反馈)
 */
function formatEventTime(time: string | Date | null, isPastBased: boolean): string | null {
  if (!time) return null;
  const t = typeof time === 'string' ? new Date(time) : time;
  if (isNaN(t.getTime())) return null;
  const now = new Date();
  // 距离 = 绝对值;direction 决定语义(后 vs 前)
  const diffMs = isPastBased ? now.getTime() - t.getTime() : t.getTime() - now.getTime();
  const diffH = diffMs / 3600000;
  const diffD = diffMs / 86400000;

  // 过去/未来交叉(负值):降级到完整日期
  if (diffMs < 0) {
    return t.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
  }

  if (isPastBased) {
    if (diffH < 1) {
      const mins = Math.max(1, Math.floor(diffMs / 60000));
      return `${mins} 分钟前`;
    }
    if (t.toDateString() === now.toDateString()) {
      return `${Math.floor(diffH)} 小时前`;
    }
    if (diffD < 1.5) {
      return `昨天 ${t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    }
    if (diffD < 7) {
      return `${Math.ceil(diffD)} 天前`;
    }
    return t.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
  }

  // future-based(活动/体育)
  if (t.toDateString() === now.toDateString())
    return `今天 ${t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  if (diffD < 1.5)
    return `明天 ${t.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  if (diffD < 7) {
    const days = Math.ceil(diffD);
    return `${days} 天后 · ${t.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`;
  }
  return t.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
}

/** 展开端显示的完整时间("5月20日 周三 19:00 – 22:00") */
function formatEventFullTime(startAt: string | Date | null, endAt: string | Date | null): string | null {
  if (!startAt) return null;
  const start = typeof startAt === 'string' ? new Date(startAt) : startAt;
  if (isNaN(start.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', weekday: 'short' };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  const dateStr = start.toLocaleDateString('zh-CN', opts);
  const startTime = start.toLocaleTimeString('zh-CN', timeOpts);

  if (endAt) {
    const end = typeof endAt === 'string' ? new Date(endAt) : endAt;
    if (!isNaN(end.getTime())) {
      // 同一天 → 简写;跨天 → 全写
      if (start.toDateString() === end.toDateString()) {
        return `${dateStr} ${startTime} – ${end.toLocaleTimeString('zh-CN', timeOpts)}`;
      }
      return `${dateStr} ${startTime} – ${end.toLocaleDateString('zh-CN', opts)} ${end.toLocaleTimeString('zh-CN', timeOpts)}`;
    }
  }
  return `${dateStr} ${startTime}`;
}

/**
 * Phase 3B 短期倒计时:仅在 startAt 距现在 < 24h 时返回 "还有 X 小时/分钟" 或 "进行中"
 * 配合 formatEventTime("今天 19:00")使用,给紧迫感
 */
function getCountdown(startAt: string | Date | null, endAt: string | Date | null): string | null {
  if (!startAt) return null;
  const s = typeof startAt === 'string' ? new Date(startAt) : startAt;
  if (isNaN(s.getTime())) return null;
  const now = Date.now();
  const diffMs = s.getTime() - now;

  // 已过 startAt:活动可能正在进行 — 检查 endAt
  if (diffMs <= 0) {
    if (endAt) {
      const e = typeof endAt === 'string' ? new Date(endAt) : endAt;
      if (!isNaN(e.getTime()) && e.getTime() > now) return '进行中';
    }
    return null; // 已结束,不显倒计时(API 会自动归档为 expired)
  }
  // < 1 小时:分钟级
  if (diffMs < 3600e3) {
    const m = Math.max(1, Math.ceil(diffMs / 60000));
    return `还有 ${m} 分钟`;
  }
  // < 24 小时:小时级
  if (diffMs < 24 * 3600e3) {
    const h = Math.ceil(diffMs / 3600e3);
    return `还有 ${h} 小时`;
  }
  return null; // > 24h: timeLabel 已经显"明天/X 天后",不重复
}

// Phase 3B 状态 badge 元数据
const STATUS_BADGE: Record<string, { label: string; cls: string; icon: LucideIcon } | null> = {
  active:    null,
  fulfilled: { label: '已结清', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  canceled:  { label: '已取消', cls: 'bg-rose-50 text-rose-700 border-rose-200',           icon: XCircle },
  expired:   { label: '已过期', cls: 'bg-stone-100 text-stone-500 border-stone-200',       icon: Hourglass },
};

export function EventCard({
  event,
  autoExpand = false,
  onEdit,
  onDelete,
  onReport,
}: {
  event: EventCardData;
  /** 后续可能从 /localnews?focus=ID 进来时自动展开 */
  autoExpand?: boolean;
  /** Phase 3C: 跟 ItemCard/ListingCard 一致 — 展开后 ⋯ 菜单的三个 action
   *  onEdit/onDelete 只对 source==='user' 的 UGC 有意义(scrape 不能改/删);
   *  onReport 对 UGC + scrape 都能用(任何人可举报)
   *  父组件(/localnews/page.tsx)处理 EditCodePrompt → 验证密码 → 后续动作 */
  onEdit?: (event: EventCardData) => void;
  onDelete?: (event: EventCardData) => void;
  onReport?: (event: EventCardData) => void;
}) {
  const [expanded, setExpanded] = useState(autoExpand);
  const [imgFailed, setImgFailed] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  // autoExpand:focus 进来的目标卡片自动 scroll
  useEffect(() => {
    if (!autoExpand) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
    );
  }, [autoExpand]);

  const cat = event.category ?? 'events';
  const colors = CATEGORY_COLOR[cat] ?? CATEGORY_COLOR.events;
  const CategoryIcon = CATEGORY_ICON[cat] ?? Sparkles;  // Phase 3B
  const [DecoA, DecoB] = CATEGORY_DECO[cat] ?? CATEGORY_DECO.other;  // Phase 3C 占位装饰 icon
  // news/discussion 用 publishedAt(发布时间,过去),events/sports 用 startAt(活动时间,未来)
  const isPastBased = event.category === 'discussion'; // Phase 3A.1: news 已合并到 discussion
  const referenceTime = isPastBased ? event.publishedAt : event.startAt;
  const timeLabel = formatEventTime(referenceTime, isPastBased);
  // 展开端完整时间:past-based 显发布时间日期;future-based 显活动起止
  const fullTimeLabel = isPastBased
    ? formatEventFullTime(event.publishedAt, null)
    : formatEventFullTime(event.startAt, event.endAt);
  // Phase 3B: user-posted event 无 startAt → 显"长期"占位
  const isUserPosted = event.source === 'user';
  const longTermLabel = isUserPosted && !event.startAt ? '长期' : null;
  // Phase 3B: 短期倒计时(< 24h)
  const countdown = getCountdown(event.startAt, event.endAt);
  // Phase 3B: 状态 badge
  const statusBadge = event.status && STATUS_BADGE[event.status]
    ? STATUS_BADGE[event.status]
    : null;
  // Phase 3B: 响应数(仅 user-posted 显)
  const responseCount = event.responseCount ?? 0;
  const showResponseChip = isUserPosted;
  // Phase 3B: 主响应按钮可用性 — 非 active 状态置灰不可点
  const canRespond = !event.status || event.status === 'active';

  // Phase 3C: ⋯ 菜单(修改/删除/举报) — 跟 ItemCard/ListingCard 同款
  //   修改/删除 仅 UGC 才有意义(scrape 不能改);举报对 UGC + scrape 都开
  //   实际执行由父组件 (/localnews/page.tsx) 通过 EditCodePrompt 验证密码后处理
  const moreMenuItems: MoreMenuItem[] = [
    ...(isUserPosted && onEdit   ? [{ icon: <Pencil size={14} />, label: '修改', onClick: () => onEdit(event) }] : []),
    ...(isUserPosted && onDelete ? [{ icon: <Trash2 size={14} />, label: '删除', onClick: () => onDelete(event), danger: true }] : []),
    ...(onReport                 ? [{ icon: <Flag   size={14} />, label: '举报', onClick: () => onReport(event) }] : []),
  ];

  // Phase 2A 热度梯度
  const heat = getHeatLevel(event.clickCount, event.scrapedAt);
  // Phase 3A 发给 poster modal 状态
  const [sendToPosterOpen, setSendToPosterOpen] = useState(false);
  const showImage = !!(event.imageUrl && !imgFailed);
  // 城市先于场地展示(距离决策锚点)。city 加粗高亮,venue 浅色辅助
  const { city: locCity, venue: locVenue } = parseLocation(event.location);

  // 心愿单收藏状态(跟 ListingCard 同款 subscribe 模式)
  const [isSaved, setIsSaved] = useState(false);
  useEffect(() => {
    const update = () => setIsSaved(isEventSaved(event.id));
    update();
    return subscribeSavedEvents(update);
  }, [event.id]);

  const handleToggleSave = () => {
    const toIso = (v: string | Date | null) =>
      typeof v === 'string' ? v : v ? v.toISOString() : null;
    const ret = toggleSavedEvent({
      id: event.id,
      title: event.title,
      source: event.source,
      sourceUrl: event.sourceUrl,
      startAt: toIso(event.startAt),
      endAt: toIso(event.endAt),
      publishedAt: toIso(event.publishedAt),
      location: event.location,
      category: event.category,
      imageUrl: event.imageUrl,
    });
    if (ret === 'full') showWarning('活动心愿单满了(最多 50 条)');
    else if (ret === 'added') showSuccess('已加入活动心愿单');
    // removed 静默
  };

  // Phase 2A:展开时上报 click(/api/events/[id]/click)— 防刷在 server 端做
  // 仅展开方向计数(收起不计),避免双击产生 2 次 increment
  const trackedRef = useRef(false);
  const reportClick = () => {
    if (trackedRef.current) return; // 同一卡片单 mount 周期只上报一次
    trackedRef.current = true;
    fetch(`/api/events/${event.id}/click`, { method: 'POST' }).catch(() => {
      /* 静默 — server 防刷或网络故障不影响体验 */
    });
  };

  const toggleExpand = () => {
    setExpanded(prev => {
      const next = !prev;
      if (next) {
        reportClick();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          })
        );
      }
      return next;
    });
  };

  // 点卡片空白处 toggle;按钮 / 链接 / 标 data-no-toggle 的元素不触发
  const onCardClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, [data-no-toggle]')) return;
    toggleExpand();
  };

  return (
    <article
      ref={cardRef}
      onClick={onCardClick}
      className={`relative rounded-card shadow-card border overflow-hidden hover:shadow-card-hover transition-all cursor-pointer scroll-mt-44 md:scroll-mt-24 ${
        isUserPosted ? colors.tintBg : 'bg-white'
      } ${
        expanded ? 'border-brand/40 col-span-2 md:col-span-1' : 'border-stone-200'
      }`}
    >
      {/* ♥ 收藏按钮(article 级浮动):无图卡显示;有图卡用封面内的浮动 ♥ */}
      <button
        type="button"
        data-no-toggle
        onClick={(e) => { e.stopPropagation(); handleToggleSave(); }}
        aria-label={isSaved ? '从活动心愿单移除' : '加入活动心愿单'}
        className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full items-center justify-center shadow-card active:scale-90 transition-all ${
          isSaved
            ? 'bg-rose-500 text-white'
            : 'bg-white/90 text-stone-700 hover:bg-white backdrop-blur-sm'
        } ${showImage ? 'hidden' : 'flex'}`}
      >
        <Heart size={15} strokeWidth={2.2} fill={isSaved ? 'currentColor' : 'none'} />
      </button>

      {/* 图片区:紧凑端 4/3(mobile 比 16/9 更适合双列窄卡);展开 16/9 横展
          Phase 3C 无图占位:主类目 icon + 对角装饰 icon(opacity 18% 营造简笔设计感) */}
      <div
        className={`relative overflow-hidden ${
          expanded ? 'aspect-[2/1]' : 'aspect-[4/3] md:aspect-[16/9]'
        } ${showImage ? 'bg-stone-100' : `${colors.imgBg} flex items-center justify-center`}`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl!}
            alt={event.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            {/* 主 icon 居中 */}
            <CategoryIcon
              size={expanded ? 56 : 40}
              strokeWidth={1.5}
              className={colors.imgIconColor}
              aria-hidden
            />
            {/* 装饰 icon — 左上 + 右下,opacity 18% */}
            <DecoA
              size={expanded ? 28 : 20}
              strokeWidth={1.5}
              className={`${colors.imgIconColor} absolute top-2 left-2 opacity-[0.18]`}
              aria-hidden
            />
            <DecoB
              size={expanded ? 28 : 20}
              strokeWidth={1.5}
              className={`${colors.imgIconColor} absolute bottom-2 right-2 opacity-[0.18]`}
              aria-hidden
            />
          </>
        )}

        {/* 有图卡:♥ 按钮浮在封面右上,跟 ItemCard / ListingCard 一致 */}
        {showImage && (
          <button
            type="button"
            data-no-toggle
            onClick={(e) => { e.stopPropagation(); handleToggleSave(); }}
            aria-label={isSaved ? '从活动心愿单移除' : '加入活动心愿单'}
            className={`absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center shadow-card active:scale-90 transition-all ${
              isSaved
                ? 'bg-rose-500 text-white'
                : 'bg-white/90 text-stone-700 hover:bg-white backdrop-blur-sm'
            }`}
          >
            <Heart size={15} strokeWidth={2.2} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      {/* 文字区 — tint 已在 article 外层设(UGC 时整张卡 tint,grid 拉伸也覆盖);
          这里透明继承,无白色 strip */}
      <div className="p-3 md:p-4 space-y-1.5">
        {/* 类目 chip(Lucide icon)+ 状态 + 响应数 + 时间 + 倒计时 + 热度(Phase 2A)
            UGC 时 chip 用白底 + 类目深字(防 chip 和 tint 融成一片);scrape 用类目浅底 + 深字 */}
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
            isUserPosted ? `${colors.chipOnTintBg} ${colors.chipOnTintText}` : `${colors.chipBg} ${colors.chipText}`
          }`}>
            <CategoryIcon size={11} strokeWidth={2.2} />
            {cat === 'other' && event.customCategory ? event.customCategory : (CATEGORY_LABEL[cat] ?? cat)}
          </span>

          {/* Phase 3B 状态 badge — active 不显 */}
          {statusBadge && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${statusBadge.cls}`}>
              <statusBadge.icon size={11} strokeWidth={2.2} />
              {statusBadge.label}
            </span>
          )}

          {/* Phase 3B 响应数 chip(user-posted 才显) */}
          {showResponseChip && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
              <Users size={11} strokeWidth={2.2} />
              {event.maxAttendees
                ? `想找 ${event.maxAttendees} · 已 ${responseCount} 响应`
                : `已 ${responseCount} 响应`}
            </span>
          )}

          {/* 热度 — 紧凑端在 chip 旁边,展开端也显;颜色梯度按 clicks/hour */}
          {heat && (
            <span className={`inline-flex items-center gap-0.5 font-semibold ${heat.color}`} title={`热度 · ${event.clickCount ?? 0} 次点击`}>
              <Flame size={12} strokeWidth={2.4} fill={heat.fill ? 'currentColor' : 'none'} />
              {heat.double && <Flame size={12} strokeWidth={2.4} fill="currentColor" />}
            </span>
          )}

          {/* 时间标签 / "长期" — 紧凑端显;展开端独立时间行 */}
          {!expanded && (timeLabel || longTermLabel) && (
            <span className="text-stone-600">{timeLabel ?? longTermLabel}</span>
          )}
          {/* Phase 3B 短期倒计时 — < 24h 才显,跟时间标签配对 */}
          {!expanded && countdown && (
            <span className="text-rose-600 font-medium">{countdown}</span>
          )}

          {/* Phase 3C: ⋯ 菜单(修改/删除/举报)— 仅展开态显,推到行末尾 */}
          {expanded && moreMenuItems.length > 0 && (
            <span className="ml-auto" data-no-toggle>
              <MoreMenu items={moreMenuItems} />
            </span>
          )}
        </div>

        {/* 标题 */}
        <h3 className={`font-semibold text-stone-900 leading-tight ${expanded ? 'text-lg md:text-xl' : 'line-clamp-2 text-base md:text-lg'}`}>
          {event.title}
        </h3>

        {/* 紧凑端:地点(城市优先,加粗) + 描述(描述桌面才显) */}
        {!expanded && (
          <>
            {(locCity || locVenue) && (
              <div className="flex items-center gap-1 text-xs text-stone-500">
                <MapPin size={12} strokeWidth={2} className="flex-shrink-0" />
                <span className="truncate">
                  {locCity && <span className="font-medium text-stone-800">{locCity}</span>}
                  {locCity && locVenue && <span className="text-stone-400"> · </span>}
                  {locVenue && <span>{locVenue}</span>}
                </span>
              </div>
            )}
            {event.description && (
              <p className="text-sm text-stone-600 leading-relaxed hidden md:block md:line-clamp-3">
                {event.description}
              </p>
            )}
            <div className="md:hidden text-xs text-stone-400 pt-1">点开看详情 →</div>
          </>
        )}

        {/* 展开:完整时间 + 地点 + 描述 + 原标题 + 跳源按钮 */}
        {expanded && (
          <div className="space-y-2 pt-1">
            {(fullTimeLabel || longTermLabel) && (
              <div className="flex items-start gap-1.5 text-sm text-stone-700">
                <Clock size={14} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
                <span>
                  {fullTimeLabel ?? longTermLabel}
                  {countdown && <span className="ml-2 text-rose-600 font-medium">· {countdown}</span>}
                </span>
              </div>
            )}
            {(locCity || locVenue) && (
              <div className="flex items-start gap-1.5 text-sm text-stone-700">
                <MapPin size={14} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
                <span>
                  {locCity && <span className="font-semibold">{locCity}</span>}
                  {locCity && locVenue && <span className="text-stone-400"> · </span>}
                  {locVenue && <span className="text-stone-700">{locVenue}</span>}
                </span>
              </div>
            )}
            {event.description && (
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
                {event.description}
              </p>
            )}
            {event.titleOriginal && event.titleOriginal !== event.title && (
              <div className="text-xs text-stone-500 pt-1 border-t border-stone-100">
                原标题: <span className="italic">{event.titleOriginal}</span>
              </div>
            )}

            {/* Phase 3A 用户发布 events 公开联系方式块(若 poster 选了公开) */}
            {event.source === 'user' && event.posterContactPublic && event.posterContact && (
              <div className="flex items-center gap-2 pt-2 mt-1 border-t border-stone-100 text-sm" data-no-toggle>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-stone-500 mb-0.5">
                    {event.posterContactType === 'other' ? (event.posterContactLabel || '联系方式') :
                     event.posterContactType === 'wechat' ? '微信' :
                     event.posterContactType === 'phone' ? '手机' :
                     event.posterContactType === 'discord' ? 'Discord' :
                     event.posterContactType === 'email' ? 'Email' : '联系方式'}
                  </div>
                  <div className="font-mono text-stone-900 break-all">{event.posterContact}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(event.posterContact!);
                      showSuccess('已复制');
                    } catch {
                      showWarning('复制失败,请手动选中');
                    }
                  }}
                  className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-chip bg-stone-100 border border-stone-300 text-stone-700 hover:bg-stone-200"
                >
                  复制
                </button>
              </div>
            )}

            {/* 操作区:跳源(scraped) / 发布者信息(user) + 复制到微信群
                Phase 3C: UGC 发布者灰字 → 首字母圆圈头像 + 昵称(社交化) */}
            <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-stone-100 flex-wrap" data-no-toggle>
              {event.source === 'user' ? (
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full ${colors.avatarBg} text-white flex items-center justify-center text-[10px] font-medium flex-shrink-0`}>
                    {(event.posterNickname?.trim()?.[0] ?? '匿').toUpperCase()}
                  </div>
                  <span className="text-xs text-stone-600">
                    <span className="font-medium text-stone-800">{event.posterNickname || '匿名'}</span> 发布
                  </span>
                </div>
              ) : (
                <span className="text-[11px] text-stone-400">来源: {event.source}</span>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <ShareToWechatButton
                  event={{
                    id: event.id,
                    title: event.title,
                    category: event.category,
                    status: event.status,
                    maxAttendees: event.maxAttendees,
                    responseCount: event.responseCount,
                  }}
                />
                {event.source !== 'user' ? (
                  <a
                    href={event.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-chip text-sm font-medium hover:bg-brand-dark active:scale-95 transition-all shadow-card no-underline"
                  >
                    <ExternalLink size={13} />
                    查看原站
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => canRespond && setSendToPosterOpen(true)}
                    disabled={!canRespond}
                    title={canRespond ? '' : '活动已结束 / 已结清 / 已取消'}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip text-sm font-medium transition-all shadow-card ${
                      canRespond
                        ? 'bg-brand text-white hover:bg-brand-dark active:scale-95'
                        : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                    }`}
                  >
                    <Send size={13} />
                    发送联系方式
                  </button>
                )}
              </div>
            </div>

            {/* Phase 2C 评论区 — 找搭子/讨论 */}
            <EventCommentSection eventId={event.id} eventTitle={event.title} />

            {/* Phase 3A 发给 poster modal */}
            {sendToPosterOpen && (
              <ContactSendModal
                eventId={event.id}
                eventTitle={event.title}
                target={{
                  id: null,
                  nickname: event.posterNickname || '发布者',
                  content: event.title,
                }}
                onClose={() => setSendToPosterOpen(false)}
                onSent={() => {
                  setSendToPosterOpen(false);
                  showSuccess('已发送你的联系方式');
                }}
              />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
