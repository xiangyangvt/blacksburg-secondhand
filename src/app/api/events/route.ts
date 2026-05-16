// Sprint 7 Phase 1.7+:events 公开列表 API
// 给 /localnews 页面 fetch 用
//
// GET — 列出 events(支持 category 筛选)
// POST — 用户发布(Phase 3A,source='user')
//
// 排序逻辑(Sean 反馈,Phase 1.9):
// - 活动/体育 用 startAt(活动时间);新闻/讨论 用 publishedAt(发布时间)
// - 统一按"距离现在多久"排序 — 绝对时间差越小越靠前

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const VID_COOKIE = 'hb_vid';
const VID_MAX_AGE = 60 * 60 * 24 * 365;
const POST_PER_DAY_LIMIT = 3;
// Phase 3A.1: 用户发布可选类别(新命名)
const ALLOWED_CATEGORIES = new Set(['life', 'exercise', 'academic', 'competition', 'discussion', 'other']);
const ALLOWED_CONTACT_TYPES = new Set(['wechat', 'phone', 'discord', 'email', 'other']);

type EventRow = {
  category: string | null;
  startAt: Date | null;
  publishedAt: Date | null;
  scrapedAt: Date;
};

/** 每个 event 取它"语义上"的时间锚点(news/discussion 用发布时间,events/sports 用活动时间) */
function relevanceTime(e: EventRow): number {
  // Phase 3A.1: news 已合并到 discussion;旧数据兜底
  if (e.category === 'discussion' || e.category === 'news') {
    return (e.publishedAt ?? e.scrapedAt).getTime();
  }
  return (e.startAt ?? e.publishedAt ?? e.scrapedAt).getTime();
}

// GET /api/events?category=events|sports|news|discussion&limit=50
//
// Phase 3A.1: 旧 → 新类别 ID 翻译表(Railway 上 db push 不跑 data migration,
// DB 里可能还存旧 ID;UI 层用新 ID 过滤会找不到。这里两边都包容)
const CATEGORY_NEW_TO_OLD: Record<string, string[]> = {
  life:        ['life', 'events'],
  competition: ['competition', 'sports'],
  discussion:  ['discussion', 'news'],
  // exercise / academic / other 是新的,不需要 alias
};
const CATEGORY_OLD_TO_NEW: Record<string, string> = {
  events: 'life',
  sports: 'competition',
  news:   'discussion',
};

// Phase 2A 新增 response 字段:
//   - 每条 event 自带 clickCount(已在 model 里,直接 select)
//   - 顶层 availableCategories: 当前 dataset 里实际有数据的类别列表
//     (前端用于"无数据自动隐藏 chip")
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const category = sp.get('category');
  const limitRaw = sp.get('limit');
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 100) : 50;

  // 过滤:仅 active + qualityScore ≥ 0.5 + 未过期(过期 = endAt 已过 OR 没 endAt 但 startAt 早于 1 天前)
  // 新闻/讨论没有 startAt/endAt — 走 startAt:null 分支保留下来,后续靠 publishedAt 排序
  const oneDayAgo = new Date(Date.now() - 86400000);

  const baseWhere: any = {
    status: 'active',
    qualityScore: { gte: 0.5 },
    OR: [
      { endAt: { gte: new Date() } },
      { endAt: null, startAt: { gte: oneDayAgo } },
      { startAt: null },
    ],
  };
  // category 筛选 — 同时匹配新 ID 和旧 ID(兼容未迁移数据)
  const where = category
    ? { ...baseWhere, category: { in: CATEGORY_NEW_TO_OLD[category] ?? [category] } }
    : baseWhere;

  // 并行:① 候选 events ② 全数据集 category 列表(无视 category 筛选)
  const [candidates, allCategoryRows] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { scrapedAt: 'desc' },
      take: Math.min(limit * 3, 300),
    }),
    // 拿当前 active+合规 events 里实际出现的 category(不受 category 筛选影响)
    // Phase 2A: 前端用这个让 chip 自动隐藏没数据的类别
    prisma.event.groupBy({
      by: ['category'],
      where: baseWhere,
      _count: { id: true },
    }),
  ]);

  const now = Date.now();
  const sorted = candidates
    .map(e => ({ row: e, score: Math.abs(relevanceTime(e as any) - now) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(x => x.row);

  // availableCategories — 把旧 ID 翻成新 ID,UI 用新 ID 过滤 chip
  const availableCategoriesRaw = allCategoryRows
    .filter(r => r.category && r._count.id > 0)
    .map(r => CATEGORY_OLD_TO_NEW[r.category as string] ?? (r.category as string));
  const availableCategories = Array.from(new Set(availableCategoriesRaw));

  // Strip 敏感字段 — posterCodeHash / posterVisitorId 不能返客户端
  // 同时把 photoUrls 从 JSON string parse 成数组方便前端用
  const safe = sorted.map((e: any) => {
    const { posterCodeHash, posterVisitorId, photoUrls: pu, ...rest } = e;
    let photoUrls: string[] = [];
    if (pu) {
      try { photoUrls = JSON.parse(pu); } catch { photoUrls = []; }
    }
    return { ...rest, photoUrls };
  });

  return NextResponse.json({
    events: safe,
    availableCategories,
  });
}

// === Phase 3A: 用户发布 event ===
// body: { title, category, customCategory?, description, nickname, code,
//         startAt?, endAt?, location?,
//         contactType?, contact?, contactLabel?, contactPublic?,
//         photoUrls? }
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: '无效请求' }, { status: 400 }); }

  // === validate ===
  const title       = (body.title       ?? '').toString().trim().slice(0, 50);
  const category    = (body.category    ?? '').toString();
  const customCat   = (body.customCategory ?? '').toString().trim().slice(0, 20) || null;
  const description = (body.description ?? '').toString().trim().slice(0, 500);
  const nickname    = (body.nickname    ?? '').toString().trim().slice(0, 20);
  const code        = (body.code        ?? '').toString();
  const startAtRaw  = body.startAt as string | undefined;
  const endAtRaw    = body.endAt as string | undefined;
  const location    = (body.location ?? '').toString().trim().slice(0, 80) || null;
  const contactType = (body.contactType ?? '').toString() || null;
  const contact     = (body.contact ?? '').toString().trim().slice(0, 80) || null;
  const contactLabel = (body.contactLabel ?? '').toString().trim().slice(0, 20) || null;
  const contactPublic = Boolean(body.contactPublic);
  const photoUrls   = Array.isArray(body.photoUrls)
    ? body.photoUrls.filter((u: any) => typeof u === 'string').slice(0, 4)
    : null;

  if (!title) return NextResponse.json({ ok: false, error: '请填写标题' }, { status: 400 });
  if (!description) return NextResponse.json({ ok: false, error: '请填写描述' }, { status: 400 });
  if (!nickname) return NextResponse.json({ ok: false, error: '请填写昵称' }, { status: 400 });
  if (!ALLOWED_CATEGORIES.has(category)) {
    return NextResponse.json({ ok: false, error: '类别无效' }, { status: 400 });
  }
  if (category === 'other' && !customCat) {
    return NextResponse.json({ ok: false, error: '请填写「其他」类别的具体名称' }, { status: 400 });
  }
  // Phase 3A.1: 跟 二手/室友 同款 — alphanumeric ≥ 6 位(不限数字)
  if (code.length < 6 || code.length > 50) {
    return NextResponse.json({ ok: false, error: '识别码至少 6 位' }, { status: 400 });
  }
  if (contactType && !ALLOWED_CONTACT_TYPES.has(contactType)) {
    return NextResponse.json({ ok: false, error: '联系方式类型无效' }, { status: 400 });
  }
  if (contactType === 'other' && contact && !contactLabel) {
    return NextResponse.json({ ok: false, error: '请填写「其他」联系方式类型的具体平台' }, { status: 400 });
  }

  // bot UA 过滤
  const ua = (req.headers.get('user-agent') ?? '').toLowerCase();
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
    return NextResponse.json({ ok: true, skipped: 'bot' });
  }

  // visitorId
  const existing = req.cookies.get(VID_COOKIE)?.value;
  const visitorId = existing || randomUUID();

  // 防刷:同 visitor 每天 ≤ 3 条
  const dayAgo = new Date(Date.now() - 86400e3);
  const recent = await prisma.event.count({
    where: {
      source: 'user',
      posterVisitorId: visitorId,
      scrapedAt: { gt: dayAgo },
    },
  });
  if (recent >= POST_PER_DAY_LIMIT) {
    return NextResponse.json({ ok: false, error: `今天已发布 ${recent} 条,明天再来吧` }, { status: 429 });
  }

  // 识别码 hash
  const posterCodeHash = await bcrypt.hash(code, 10);

  // 时间 parse
  const startAt = startAtRaw ? new Date(startAtRaw) : null;
  const endAt = endAtRaw ? new Date(endAtRaw) : null;
  if (startAt && isNaN(startAt.getTime())) return NextResponse.json({ ok: false, error: '开始时间无效' }, { status: 400 });
  if (endAt && isNaN(endAt.getTime())) return NextResponse.json({ ok: false, error: '结束时间无效' }, { status: 400 });

  // 创建 — sourceUrl 用我们自己的 /localnews/user/[temp]/<id> (cuid 在 create 时生成,先用临时占位)
  // 注:Event 表 @@unique([source, sourceUrl]),sourceUrl 必须独特;用 timestamp + randomUUID 短串保证唯一
  const sourceUrlTag = `u-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const event = await prisma.event.create({
    data: {
      source: 'user',
      sourceUrl: `internal:${sourceUrlTag}`,
      title,
      titleOriginal: null,
      description,
      startAt,
      endAt,
      location,
      category: category === 'other' ? 'other' : category,
      customCategory: category === 'other' ? customCat : null,
      imageUrl: photoUrls && photoUrls.length > 0 ? photoUrls[0] : null,
      photoUrls: photoUrls && photoUrls.length > 0 ? JSON.stringify(photoUrls) : null,
      qualityScore: 0.9,
      scrapedAt: new Date(),
      publishedAt: new Date(),
      status: 'active',
      posterCodeHash,
      posterVisitorId: visitorId,
      posterNickname: nickname,
      posterContactType: contactType,
      posterContact: contact,
      posterContactLabel: contactType === 'other' ? contactLabel : null,
      posterContactPublic: contactPublic,
    },
  });

  // 不暴露 posterCodeHash / posterVisitorId 给客户端
  const { posterCodeHash: _h, posterVisitorId: _v, ...safe } = event as any;

  const res = NextResponse.json({ ok: true, event: safe });
  if (!existing) {
    res.cookies.set(VID_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: VID_MAX_AGE,
      path: '/',
    });
  }
  return res;
}
