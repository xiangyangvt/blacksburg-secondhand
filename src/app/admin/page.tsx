// 管理员后台 — 看举报、管隐藏商品、清理灌水
// 路由：/admin
// 认证：cookie（密码 = ADMIN_PASSWORD env var）
// robots.txt 已禁止抓取此路径

import { isAdmin, setAdminCookie, clearAdminCookie, getAdminPassword } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formatPrice, timeAgo, categoryLabel, parsePhotoUrls } from '@/lib/utils';
import { schedulePendingCloudinaryDeletion, getCloudinaryUsage } from '@/lib/uploader';

export const dynamic = 'force-dynamic'; // 永远拿最新

// ===== Server Actions =====
async function loginAction(formData: FormData) {
  'use server';
  const password = String(formData.get('password') ?? '');
  const expected = getAdminPassword();
  if (expected && password === expected) {
    setAdminCookie();
    redirect('/admin');
  }
  redirect('/admin?error=wrong');
}

async function logoutAction() {
  'use server';
  clearAdminCookie();
  redirect('/admin');
}

async function deleteItemAction(formData: FormData) {
  'use server';
  if (!isAdmin()) return;
  const id = String(formData.get('id'));
  // 删除前先拿到 photoUrls，硬删后异步清掉 Cloudinary 图床上的图（节省额度）
  const item = await prisma.item.findUnique({ where: { id }, select: { photoUrls: true } });
  await prisma.item.delete({ where: { id } });
  if (item) {
    // 走 24h 延迟队列（admin 强删也保留挽回机会）
    schedulePendingCloudinaryDeletion(parsePhotoUrls(item.photoUrls)).catch(() => {});
  }
  revalidatePath('/admin');
}

async function deleteInquiryAction(formData: FormData) {
  'use server';
  if (!isAdmin()) return;
  const id = String(formData.get('id'));
  await prisma.inquiry.delete({ where: { id } });
  revalidatePath('/admin');
}

async function dismissReportAction(formData: FormData) {
  'use server';
  if (!isAdmin()) return;
  const id = String(formData.get('id'));
  await prisma.report.delete({ where: { id } });
  revalidatePath('/admin');
}

async function unhideItemAction(formData: FormData) {
  'use server';
  if (!isAdmin()) return;
  const id = String(formData.get('id'));
  // 顺便清掉所有举报，重置自动隐藏触发器
  await prisma.report.deleteMany({ where: { itemId: id } });
  await prisma.item.update({ where: { id }, data: { status: 'active' } });
  revalidatePath('/admin');
}

async function unhideInquiryAction(formData: FormData) {
  'use server';
  if (!isAdmin()) return;
  const id = String(formData.get('id'));
  // 同样重置举报触发器
  await prisma.report.deleteMany({ where: { inquiryId: id } });
  await prisma.inquiry.update({ where: { id }, data: { status: 'active' } });
  revalidatePath('/admin');
}

async function deleteListingAction(formData: FormData) {
  'use server';
  if (!isAdmin()) return;
  const id = String(formData.get('id'));
  const listing = await prisma.listing.findUnique({ where: { id }, select: { photoUrls: true } });
  await prisma.listing.update({ where: { id }, data: { status: 'deleted' } });
  if (listing) {
    schedulePendingCloudinaryDeletion(parsePhotoUrls(listing.photoUrls)).catch(() => {});
  }
  revalidatePath('/admin');
}

async function unhideListingAction(formData: FormData) {
  'use server';
  if (!isAdmin()) return;
  const id = String(formData.get('id'));
  await prisma.report.deleteMany({ where: { listingId: id } });
  await prisma.listing.update({ where: { id }, data: { status: 'active' } });
  revalidatePath('/admin');
}

/** 取消待删 — 删队列记录但不 destroy（图保留） */
async function cancelPendingDeletionAction(formData: FormData) {
  'use server';
  if (!isAdmin()) return;
  const id = String(formData.get('id'));
  await prisma.pendingCloudinaryDeletion.delete({ where: { id } });
  revalidatePath('/admin');
}

// ===== 主页面 =====
type Period = 'hour' | 'day' | 'week' | 'month';

// Phase 2A 修:bucketing 全部基于 Eastern Time(美国东部),不再用 UTC / server 本地时区
// 之前用 d.toISOString() 取的是 UTC,Sean 在 EST 看 "19:00 ET 发生" 被归到 23:00 UTC
// 修后 Intl.DateTimeFormat with timeZone='America/New_York',DST 自动处理
const ET_TZ = 'America/New_York';

const ET_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: ET_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  weekday: 'short',
  hour12: false,
});

function etParts(d: Date): { year: string; month: string; day: string; hour: string; weekday: string } {
  const parts: Record<string, string> = {};
  for (const p of ET_FORMATTER.formatToParts(d)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  // Intl 偶尔返回 hour="24"(午夜后),归到 "00"
  if (parts.hour === '24') parts.hour = '00';
  return parts as any;
}

function etHourKey(d: Date): string {
  const p = etParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
}
function etDateKey(d: Date): string {
  const p = etParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}
function etWeekKey(d: Date): string {
  // 周一为周起点。Intl 给的 weekday 是 ET 当地的星期几
  const p = etParts(d);
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = WD.indexOf(p.weekday);
  const diff = wd === 0 ? -6 : 1 - wd;
  // 减去对应天数获得该周周一(同一 ET 时区下的)
  const monday = new Date(d.getTime() + diff * 86400e3);
  return etDateKey(monday);
}
function etMonthKey(d: Date): string {
  const p = etParts(d);
  return `${p.year}-${p.month}`;
}

const PERIOD_CONFIG: Record<Period, {
  label: string;
  bucketCount: number;
  sinceMs: number;
  bucketKey: (d: Date) => string;     // 把 date 归到所在 bucket 的 key(ET 时区)
  bucketStart: (offset: number) => Date; // 当前往前 offset 个 bucket 的开始时间(用于预填空桶)
  formatLabel: (key: string) => string;
}> = {
  hour: {
    label: '小时',
    bucketCount: 24,
    sinceMs: 24 * 3600e3,
    bucketKey: etHourKey,
    // 直接 now - offset 小时,bucketKey 转 ET 即可
    bucketStart: (offset) => new Date(Date.now() - offset * 3600e3),
    formatLabel: (key) => {
      const hh = key.slice(11, 13);
      return `${parseInt(hh, 10)}:00`;
    },
  },
  day: {
    label: '天',
    bucketCount: 14,
    sinceMs: 14 * 86400e3,
    bucketKey: etDateKey,
    bucketStart: (offset) => new Date(Date.now() - offset * 86400e3),
    formatLabel: (key) => {
      const [, m, dd] = key.split('-');
      return `${parseInt(m, 10)}/${parseInt(dd, 10)}`;
    },
  },
  week: {
    label: '周',
    bucketCount: 12,
    sinceMs: 12 * 7 * 86400e3,
    bucketKey: etWeekKey,
    bucketStart: (offset) => new Date(Date.now() - offset * 7 * 86400e3),
    formatLabel: (key) => {
      const [, m, dd] = key.split('-');
      return `${parseInt(m, 10)}/${parseInt(dd, 10)}`;
    },
  },
  month: {
    label: '月',
    bucketCount: 6,
    sinceMs: 6 * 31 * 86400e3,
    bucketKey: etMonthKey,
    // 30.5 天接近平均月长;6 个月范围内 ET 月份归类稳定
    bucketStart: (offset) => new Date(Date.now() - offset * 30.5 * 86400e3),
    formatLabel: (key) => `${parseInt(key.slice(5, 7), 10)}月`,
  },
};

export default async function AdminPage({ searchParams }: { searchParams: { error?: string; period?: string } }) {
  // 没设密码或还是默认密码：拒绝
  if (!getAdminPassword()) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-6">
          <h1 className="text-xl font-bold text-red-600 mb-3">⚠️ 后台未启用</h1>
          <p className="text-sm text-stone-700 leading-relaxed">
            后台需要设置 <code className="bg-stone-100 px-1.5 py-0.5 rounded">ADMIN_PASSWORD</code> 环境变量才能登录，
            而且不能用默认值 <code className="bg-stone-100 px-1.5 py-0.5 rounded">changeme-in-production</code>。
          </p>
          <p className="text-sm text-stone-600 mt-3">
            去 Railway → 你的服务 → Variables 设一个强密码，重新部署后即可。
          </p>
        </div>
      </main>
    );
  }

  if (!isAdmin()) {
    return <LoginScreen error={searchParams.error} />;
  }

  const [
    reports, hiddenItems, hiddenInquiries, hiddenListings,
    activeCount, inquiryCount, reportCount,
    activeListingCount, applicationCount, pendingApplicationCount,
  ] = await Promise.all([
    prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        item:    true,
        inquiry: { include: { item: true } },
        listing: true,
      },
    }),
    prisma.item.findMany({
      where: { status: 'hidden' },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.inquiry.findMany({
      where: { status: 'hidden' },
      orderBy: { updatedAt: 'desc' },
      include: { item: true },
    }),
    prisma.listing.findMany({
      where: { status: 'hidden' },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.item.count({ where: { status: 'active' } }),
    prisma.inquiry.count(),
    prisma.report.count(),
    prisma.listing.count({ where: { status: 'active' } }),
    prisma.application.count(),
    prisma.application.count({ where: { status: 'pending' } }),
  ]);

  // 来源渠道分布：近 30 天 item 按 utmSource 聚合（单独一次查询，方便类型 cast）
  const channelBreakdown = (await (prisma.item as any).groupBy({
    by: ['utmSource'],
    where: {
      createdAt: { gte: new Date(Date.now() - 30 * 86400e3) },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })) as Array<{ utmSource: string | null; _count: { id: number } }>;

  // 待删 Cloudinary 图队列：方便 admin 取消误删
  const pendingDeletions = await prisma.pendingCloudinaryDeletion.findMany({
    orderBy: { scheduledFor: 'asc' },
    take: 100,
  });

  // Cloudinary 用量（5 分钟内存缓存；未配置 / 拉取失败返回 null）
  const cloudinaryUsage = await getCloudinaryUsage();

  // 访问统计 —— 按选定时间跨度（小时/天/周/月）和平台分桶
  // 二手：/、/item/[id]；室友：/roommates；其它（/my、/admin 等）忽略
  const period: Period = (['hour', 'day', 'week', 'month'].includes(searchParams.period ?? '')
    ? searchParams.period
    : 'day') as Period;
  const cfg = PERIOD_CONFIG[period];

  const since = new Date(Date.now() - cfg.sinceMs);
  const views = await prisma.pageView.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, visitorId: true, path: true },
    take: 50000,
  });
  const classifyPath = (p: string): 'item' | 'listing' | 'event' | null => {
    if (p === '/' || p.startsWith('/item/')) return 'item';
    if (p === '/roommates' || p.startsWith('/roommates')) return 'listing';
    if (p === '/localnews' || p.startsWith('/localnews')) return 'event';  // Phase 2A
    return null;
  };

  // 预填空桶（保证 chart 连续 + 顺序）
  const buildBuckets = () => {
    const m = new Map<string, { pageviews: number; visitors: Set<string> }>();
    for (let i = cfg.bucketCount - 1; i >= 0; i--) {
      const key = cfg.bucketKey(cfg.bucketStart(i));
      m.set(key, { pageviews: 0, visitors: new Set() });
    }
    return m;
  };
  const itemBuckets    = buildBuckets();
  const listingBuckets = buildBuckets();
  const eventBuckets   = buildBuckets();
  const itemVisitors    = new Set<string>();
  const listingVisitors = new Set<string>();
  const eventVisitors   = new Set<string>();

  for (const v of views) {
    const kind = classifyPath(v.path);
    if (!kind) continue;
    const key = cfg.bucketKey(v.createdAt);
    const m = kind === 'item' ? itemBuckets : kind === 'listing' ? listingBuckets : eventBuckets;
    const vset = kind === 'item' ? itemVisitors : kind === 'listing' ? listingVisitors : eventVisitors;
    const b = m.get(key);
    if (b) {
      b.pageviews += 1;
      b.visitors.add(v.visitorId);
      vset.add(v.visitorId);
    }
  }
  const toSeries = (m: Map<string, { pageviews: number; visitors: Set<string> }>) =>
    Array.from(m.entries()).map(([key, b]) => ({
      label: cfg.formatLabel(key),
      pageviews: b.pageviews,
      visitors: b.visitors.size,
    }));
  const itemSeries    = toSeries(itemBuckets);
  const listingSeries = toSeries(listingBuckets);
  const eventSeries   = toSeries(eventBuckets);
  const itemTotalPV    = itemSeries.reduce((s, d) => s + d.pageviews, 0);
  const listingTotalPV = listingSeries.reduce((s, d) => s + d.pageviews, 0);
  const eventTotalPV   = eventSeries.reduce((s, d) => s + d.pageviews, 0);

  // === 黑堡 events 统计(Phase 2A+2C) ===
  // 活跃 events / 总评论 / 总联系方式 send / scraper 最近运行
  const [
    activeEventCount,
    totalEventComments,
    totalContactSends,
    recentScrapeRuns,
    topHotEvents,
    sourceBreakdown,
  ] = await Promise.all([
    prisma.event.count({ where: { status: 'active' } }),
    prisma.eventComment.count({ where: { status: 'active' } }),
    prisma.eventContactSend.count({ where: { status: 'active' } }),
    prisma.scrapeRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 15,
    }),
    // 热度 Top 10 (按 clickCount)
    prisma.event.findMany({
      where: { status: 'active', clickCount: { gt: 0 } },
      orderBy: { clickCount: 'desc' },
      take: 10,
      select: { id: true, title: true, source: true, category: true, clickCount: true, startAt: true },
    }),
    // 每个源活跃 event 数
    prisma.event.groupBy({
      by: ['source'],
      where: { status: 'active' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
  ]);

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-6 bg-stone-50 min-h-screen">
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-stone-200">
        <div>
          <h1 className="text-2xl font-bold text-brand">🔧 管理后台</h1>
          <p className="text-xs text-stone-500 mt-1">仅你可见 — 不会被搜索引擎收录</p>
        </div>
        <form action={logoutAction}>
          <button className="text-sm text-stone-500 hover:text-stone-900 underline">退出</button>
        </form>
      </header>

      {/* 统计 —— 桌面端三个平台并排 */}
      <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-stone-200 p-3">
          <div className="text-xs font-semibold text-stone-500 uppercase mb-2 px-1">🛒 二手</div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="活跃商品" value={activeCount} />
            <MiniStat label="留言总数" value={inquiryCount} />
            <MiniStat label="累计举报" value={reportCount} />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-stone-200 p-3">
          <div className="text-xs font-semibold text-stone-500 uppercase mb-2 px-1">🏠 室友 & 租房</div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="活跃 listing" value={activeListingCount} />
            <MiniStat label="申请总数" value={applicationCount} />
            <MiniStat label="待处理申请" value={pendingApplicationCount} />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-stone-200 p-3">
          <div className="text-xs font-semibold text-stone-500 uppercase mb-2 px-1">⛰️ 黑堡本地</div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="活跃 events" value={activeEventCount} />
            <MiniStat label="评论总数" value={totalEventComments} />
            <MiniStat label="联系方式" value={totalContactSends} />
          </div>
        </div>
      </section>

      {/* 访问统计柱状图 —— 二手 / 室友 分开（独立截图分享） */}
      <section className="mb-8 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">📈 访问统计</h2>
          {/* 时间跨度切换：?period=hour|day|week|month；点击触发整页刷新 */}
          <div className="flex gap-1 text-xs">
            {(['hour', 'day', 'week', 'month'] as const).map(p => (
              <a
                key={p}
                href={`/admin?period=${p}`}
                className={`px-3 py-1.5 rounded-chip border transition-colors ${
                  period === p
                    ? 'bg-brand text-white border-brand font-medium'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                }`}
              >
                {PERIOD_CONFIG[p].label}
              </a>
            ))}
          </div>
        </div>
        <TrafficChart
          title="🛒 二手"
          subtitle="/、/item/[id]"
          period={period}
          series={itemSeries}
          totalPageviews={itemTotalPV}
          totalVisitors={itemVisitors.size}
          barColors={{ pv: ['#a78bfa', '#5b21b6'], uv: ['#7dd3fc', '#0369a1'] }}
        />
        <TrafficChart
          title="🏠 室友 & 租房"
          subtitle="/roommates"
          period={period}
          series={listingSeries}
          totalPageviews={listingTotalPV}
          totalVisitors={listingVisitors.size}
          barColors={{ pv: ['#fda4af', '#9f1239'], uv: ['#fcd34d', '#b45309'] }}
        />
        <TrafficChart
          title="⛰️ 黑堡本地"
          subtitle="/localnews"
          period={period}
          series={eventSeries}
          totalPageviews={eventTotalPV}
          totalVisitors={eventVisitors.size}
          barColors={{ pv: ['#86efac', '#15803d'], uv: ['#fde68a', '#92400e'] }}
        />
      </section>

      {/* === 黑堡 scraper 健康监控 === */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">🔍 Scraper 健康(最近 15 次)</h2>
        {recentScrapeRuns.length === 0 ? (
          <EmptyBox text="还没有抓取记录" />
        ) : (
          <div className="bg-white rounded-lg border border-stone-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-xs text-stone-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">源</th>
                  <th className="px-3 py-2 text-left">开始时间(ET)</th>
                  <th className="px-3 py-2 text-right">状态</th>
                  <th className="px-3 py-2 text-right">发现</th>
                  <th className="px-3 py-2 text-right">新增</th>
                  <th className="px-3 py-2 text-left">错误</th>
                </tr>
              </thead>
              <tbody>
                {recentScrapeRuns.map(r => (
                  <tr key={r.id} className="border-t border-stone-100">
                    <td className="px-3 py-2 font-mono text-xs">{r.source}</td>
                    <td className="px-3 py-2 text-xs text-stone-600">
                      {new Intl.DateTimeFormat('zh-CN', {
                        timeZone: ET_TZ,
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      }).format(r.startedAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.status === 'success' && <span className="text-emerald-600 font-medium">✓ 成功</span>}
                      {r.status === 'failed' && <span className="text-rose-600 font-medium">✗ 失败</span>}
                      {r.status === 'running' && <span className="text-amber-600 font-medium">运行中</span>}
                      {r.status === 'skipped' && <span className="text-stone-500">跳过</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.itemsFound}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{r.itemsNew}</td>
                    <td className="px-3 py-2 text-xs text-rose-600 max-w-[300px] truncate" title={r.errorMsg ?? undefined}>
                      {r.errorMsg ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* === 黑堡 源 + 热门 events 双栏 === */}
      <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 各源 event 数 */}
        <div>
          <h2 className="text-lg font-semibold mb-3">📊 各源活跃 events</h2>
          {sourceBreakdown.length === 0 ? (
            <EmptyBox text="没有活跃 events" />
          ) : (
            <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {sourceBreakdown.map(s => (
                    <tr key={s.source} className="border-b border-stone-100 last:border-b-0">
                      <td className="px-3 py-2 font-mono text-xs">{s.source}</td>
                      <td className="px-3 py-2 text-right font-mono">{s._count.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 热度 Top 10 */}
        <div>
          <h2 className="text-lg font-semibold mb-3">🔥 热门 events Top 10</h2>
          {topHotEvents.length === 0 ? (
            <EmptyBox text="还没有点击数据" />
          ) : (
            <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-xs text-stone-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">标题</th>
                    <th className="px-3 py-2 text-right">点击</th>
                  </tr>
                </thead>
                <tbody>
                  {topHotEvents.map(e => (
                    <tr key={e.id} className="border-t border-stone-100">
                      <td className="px-3 py-2 text-xs">
                        <div className="line-clamp-1">{e.title}</div>
                        <div className="text-stone-400 text-[10px] mt-0.5">{e.source} · {e.category ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-rose-600">{e.clickCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 举报队列 —— 二手 + 室友混合，targetType chip 区分 */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">📨 举报队列 ({reports.length})</h2>
        {reports.length === 0 ? (
          <EmptyBox text="✨ 没有举报" />
        ) : (
          <div className="space-y-3">
            {reports.map(r => (
              <ReportCard
                key={r.id}
                report={r}
                onDeleteItem={deleteItemAction}
                onDeleteInquiry={deleteInquiryAction}
                onDeleteListing={deleteListingAction}
                onDismiss={dismissReportAction}
              />
            ))}
          </div>
        )}
      </section>

      {/* 渠道分布（近 30 天发布的商品按 utm_source 聚合） */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">📊 渠道分布 · 近 30 天发布</h2>
        {channelBreakdown.length === 0 ? (
          <EmptyBox text="近 30 天没有发布" />
        ) : (
          <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-xs text-stone-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">来源 (utm_source)</th>
                  <th className="px-4 py-2 text-right">发布数</th>
                  <th className="px-4 py-2 text-right">占比</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const total = channelBreakdown.reduce((s, r) => s + r._count.id, 0);
                  return channelBreakdown.map((r, i) => (
                    <tr key={i} className="border-t border-stone-100">
                      <td className="px-4 py-2">
                        {r.utmSource ?? <span className="text-stone-400 italic">（直接访问 / 无来源）</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{r._count.id}</td>
                      <td className="px-4 py-2 text-right text-stone-500">
                        {total > 0 ? `${Math.round((r._count.id / total) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Cloudinary 用量监控 */}
      {cloudinaryUsage && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">
            ☁️ Cloudinary 用量
            <span className="ml-2 text-xs text-stone-400 font-normal">
              plan: {cloudinaryUsage.plan} · 数据更新于 {new Date(cloudinaryUsage.lastUpdated).toLocaleString('zh-CN')}
            </span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <UsageBar
              label="Credits（综合配额）"
              percent={cloudinaryUsage.credits.usedPercent}
              detail={`${cloudinaryUsage.credits.usage.toFixed(2)} / ${cloudinaryUsage.credits.limit} credits`}
            />
            <UsageBar
              label="存储 Storage"
              percent={cloudinaryUsage.storage.usedPercent}
              detail={`${formatBytes(cloudinaryUsage.storage.usage)} / ${formatBytes(cloudinaryUsage.storage.limit)}`}
            />
            <UsageBar
              label="流量 Bandwidth（月度）"
              percent={cloudinaryUsage.bandwidth.usedPercent}
              detail={`${formatBytes(cloudinaryUsage.bandwidth.usage)} / ${formatBytes(cloudinaryUsage.bandwidth.limit)}`}
            />
            <UsageBar
              label="变换 Transformations（月度）"
              percent={cloudinaryUsage.transformations.usedPercent}
              detail={`${cloudinaryUsage.transformations.usage.toLocaleString()} / ${cloudinaryUsage.transformations.limit.toLocaleString()}`}
            />
          </div>
          <div className="text-xs text-stone-500 grid grid-cols-3 gap-3">
            <div>资源数：<span className="font-mono text-stone-700">{cloudinaryUsage.resources.toLocaleString()}</span></div>
            <div>派生资源：<span className="font-mono text-stone-700">{cloudinaryUsage.derivedResources.toLocaleString()}</span></div>
            <div>本月 API 调用：<span className="font-mono text-stone-700">{cloudinaryUsage.requests.toLocaleString()}</span></div>
          </div>
          {(cloudinaryUsage.credits.usedPercent >= 80 ||
            cloudinaryUsage.bandwidth.usedPercent >= 80 ||
            cloudinaryUsage.storage.usedPercent >= 80 ||
            cloudinaryUsage.transformations.usedPercent >= 80) && (
            <div className="mt-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded px-3 py-2">
              ⚠️ 有指标超过 80%。Cloudinary 免费 plan 超额会限速或强制升级。
              建议：批量"已售出"清理图床、或开启更激进的 transformation 缩图、或考虑升级到 Plus plan。
            </div>
          )}
        </section>
      )}

      {/* 自动隐藏的商品 */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">🙈 自动隐藏的商品 ({hiddenItems.length})</h2>
        {hiddenItems.length === 0 ? (
          <EmptyBox text="无" />
        ) : (
          <div className="space-y-3">
            {hiddenItems.map(item => (
              <HiddenItemCard
                key={item.id}
                item={item}
                onUnhide={unhideItemAction}
                onDelete={deleteItemAction}
              />
            ))}
          </div>
        )}
      </section>

      {/* 待删 Cloudinary 图队列（24h 延迟，可挽回） */}
      {pendingDeletions.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">⏳ 待删图床队列 ({pendingDeletions.length})</h2>
          <p className="text-xs text-stone-500 mb-2">
            软删后图床上的图会延迟 24h 才真正删掉。这期间想救回的话点"取消删除"（只删队列记录，图保留；但商品已经软删了，需要单独恢复）。
          </p>
          <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-xs text-stone-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">publicId</th>
                  <th className="px-4 py-2 text-left">将于</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pendingDeletions.map((p: { id: string; publicId: string; scheduledFor: Date }) => {
                  const overdue = p.scheduledFor.getTime() < Date.now();
                  return (
                    <tr key={p.id} className="border-t border-stone-100">
                      <td className="px-4 py-2 font-mono text-xs">{p.publicId}</td>
                      <td className="px-4 py-2 text-xs text-stone-600">
                        {overdue ? <span className="text-red-600">已过期，下次访问会真删</span> : timeAgo(p.scheduledFor)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={cancelPendingDeletionAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="text-xs text-stone-600 hover:text-brand underline">取消删除</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 自动隐藏的留言 */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">🙊 自动隐藏的留言 ({hiddenInquiries.length})</h2>
        {hiddenInquiries.length === 0 ? (
          <EmptyBox text="无" />
        ) : (
          <div className="space-y-3">
            {hiddenInquiries.map(inq => (
              <HiddenInquiryCard
                key={inq.id}
                inquiry={inq}
                onUnhide={unhideInquiryAction}
                onDelete={deleteInquiryAction}
              />
            ))}
          </div>
        )}
      </section>

      {/* 自动隐藏的 listing（被 3+ IP 举报） */}
      <section>
        <h2 className="text-lg font-semibold mb-3">🚪 自动隐藏的 listing ({hiddenListings.length})</h2>
        {hiddenListings.length === 0 ? (
          <EmptyBox text="无" />
        ) : (
          <div className="space-y-3">
            {hiddenListings.map(listing => (
              <HiddenListingCard
                key={listing.id}
                listing={listing}
                onUnhide={unhideListingAction}
                onDelete={deleteListingAction}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

// ===== 子组件 =====
function LoginScreen({ error }: { error?: string }) {
  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-xl font-bold text-brand mb-1">🔒 管理员登录</h1>
        <p className="text-sm text-stone-500 mb-4">输入 Railway 上配置的 ADMIN_PASSWORD</p>
        {error === 'wrong' && (
          <p className="text-red-600 text-sm mb-3 bg-red-50 border border-red-200 rounded p-2">
            密码错误
          </p>
        )}
        <form action={loginAction} className="space-y-3">
          <input
            type="password"
            name="password"
            placeholder="密码"
            className="w-full border border-stone-300 rounded px-3 py-2 text-base"
            autoFocus
            required
          />
          <button className="w-full bg-brand text-white py-2 rounded hover:bg-brand-dark font-medium">
            登录
          </button>
        </form>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-3 text-center">
      <div className="text-2xl font-bold text-brand">{value}</div>
      <div className="text-xs text-stone-500 mt-1">{label}</div>
    </div>
  );
}

/** 紧凑版统计 —— 用于平台分组的统计卡内 */
function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-stone-50 rounded p-2 text-center">
      <div className="text-xl font-bold text-stone-900 tabular-nums">{value}</div>
      <div className="text-[10px] text-stone-500 mt-0.5">{label}</div>
    </div>
  );
}

/** 用量进度条 —— 颜色随 percent 切档（绿→琥珀→红） */
function UsageBar({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const tier =
    percent >= 90 ? { bar: 'bg-rose-500',   text: 'text-rose-600'   }
    : percent >= 80 ? { bar: 'bg-amber-500', text: 'text-amber-600' }
    : percent >= 60 ? { bar: 'bg-yellow-500', text: 'text-yellow-700' }
    : { bar: 'bg-emerald-500', text: 'text-emerald-600' };
  return (
    <div className="bg-white rounded-lg border border-stone-200 p-3">
      <div className="text-[11px] text-stone-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold tabular-nums ${tier.text}`}>{percent}%</span>
      </div>
      <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${tier.bar} transition-all`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <div className="text-[10px] text-stone-400 mt-1.5 tabular-nums">{detail}</div>
    </div>
  );
}

/** Bytes 人类化（KB/MB/GB） */
function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

/**
 * 访问统计柱状图 —— Railway 风格深色背景 + 渐变 bar
 * 单图自带 totals + 14 天分布，方便分平台单独截图
 */
function TrafficChart({
  title,
  subtitle,
  period,
  series,
  totalPageviews,
  totalVisitors,
  barColors = { pv: ['#a78bfa', '#5b21b6'], uv: ['#7dd3fc', '#0369a1'] },
}: {
  title?: string;
  subtitle?: string;
  period?: Period;
  series: Array<{ label: string; pageviews: number; visitors: number }>;
  totalPageviews: number;
  totalVisitors: number;
  barColors?: { pv: [string, string]; uv: [string, string] };
}) {
  const gradId = `barGrad-${title?.replace(/\s+/g, '') ?? 'def'}`;
  const visitGradId = `visitGrad-${title?.replace(/\s+/g, '') ?? 'def'}`;
  // 跨度文案
  const periodText = period === 'hour' ? '近 24 小时'
    : period === 'week' ? '近 12 周'
    : period === 'month' ? '近 6 个月'
    : '近 14 天';
  const W = 700;
  const H = 220;
  const PAD_LEFT = 28;
  const PAD_RIGHT = 12;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 24;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const max = Math.max(1, ...series.map(d => d.pageviews));
  // 把 y 轴 max 上取整到漂亮的数（10, 20, 50, 100, ...）
  const niceMax = niceCeiling(max);

  const bw = chartW / series.length;
  const barW = Math.max(4, bw * 0.6);

  // x 轴只标首尾（中间太挤）；label 已经按 period 格式化好
  const firstLabel = series[0]?.label ?? '';
  const lastLabel = series[series.length - 1]?.label ?? '';

  return (
    <div className="bg-stone-950 rounded-card p-4 md:p-5 shadow-overlay">
      {/* 标题 + totals */}
      {title && (
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <div>
            <div className="text-base font-semibold text-white">{title}</div>
            {subtitle && <div className="text-[11px] text-stone-500 mt-0.5 font-mono">{subtitle}</div>}
          </div>
          <div className="text-xs text-stone-500">{periodText}</div>
        </div>
      )}
      <div className="flex items-baseline gap-6 mb-3 flex-wrap">
        <div>
          <div className="text-xs text-stone-400 uppercase tracking-wide">浏览量</div>
          <div className="text-3xl font-bold text-white tabular-nums">{totalPageviews.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-stone-400 uppercase tracking-wide">独立访客</div>
          <div className="text-3xl font-bold text-white tabular-nums">{totalVisitors.toLocaleString()}</div>
        </div>
      </div>

      {/* SVG 柱状图 */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`近 14 天访问柱状图，总浏览量 ${totalPageviews}，独立访客 ${totalVisitors}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={barColors.pv[0]} />
            <stop offset="100%" stopColor={barColors.pv[1]} />
          </linearGradient>
          <linearGradient id={visitGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={barColors.uv[0]} />
            <stop offset="100%" stopColor={barColors.uv[1]} />
          </linearGradient>
        </defs>

        {/* y 轴网格线 + 标签（0 / 1/2 / max）*/}
        {[0, 0.5, 1].map((frac, i) => {
          const y = PAD_TOP + chartH * (1 - frac);
          const val = Math.round(niceMax * frac);
          return (
            <g key={i}>
              <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y} stroke="#27272a" strokeWidth={1} />
              <text x={PAD_LEFT - 4} y={y + 3} fontSize={10} fill="#71717a" textAnchor="end">
                {val}
              </text>
            </g>
          );
        })}

        {/* 柱子 */}
        {series.map((d, i) => {
          const x = PAD_LEFT + i * bw + (bw - barW) / 2;
          const pvH = (d.pageviews / niceMax) * chartH;
          const vH  = (d.visitors  / niceMax) * chartH;
          return (
            <g key={d.label + i}>
              {/* 浏览量（背景，紫色）*/}
              <rect
                x={x}
                y={PAD_TOP + chartH - pvH}
                width={barW}
                height={pvH}
                fill={`url(#${gradId})`}
                rx={2}
              >
                <title>{`${d.label}: ${d.pageviews} 浏览 · ${d.visitors} 访客`}</title>
              </rect>
              {/* 独立访客（前景，蓝色叠加，宽度更窄）*/}
              <rect
                x={x + barW * 0.25}
                y={PAD_TOP + chartH - vH}
                width={barW * 0.5}
                height={vH}
                fill={`url(#${visitGradId})`}
                rx={1.5}
                opacity={0.85}
              />
            </g>
          );
        })}

        {/* x 轴日期标签：首尾 */}
        <text x={PAD_LEFT} y={H - 6} fontSize={10} fill="#71717a">{firstLabel}</text>
        <text x={W - PAD_RIGHT} y={H - 6} fontSize={10} fill="#71717a" textAnchor="end">{lastLabel}</text>
      </svg>

      {/* 图例 */}
      <div className="flex items-center gap-4 mt-2 text-xs text-stone-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: `linear-gradient(180deg, ${barColors.pv[0]}, ${barColors.pv[1]})` }} />
          浏览量 (PV)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: `linear-gradient(180deg, ${barColors.uv[0]}, ${barColors.uv[1]})` }} />
          独立访客 (UV)
        </span>
      </div>
    </div>
  );
}

function niceCeiling(n: number): number {
  if (n <= 10) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const head = Math.ceil(n / mag);
  // 取 1/2/5/10 这类漂亮数
  const nice = head <= 1 ? 1 : head <= 2 ? 2 : head <= 5 ? 5 : 10;
  return nice * mag;
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="text-stone-500 text-sm bg-white rounded-lg border border-stone-200 p-6 text-center">
      {text}
    </div>
  );
}

function ReportCard({
  report,
  onDeleteItem,
  onDeleteInquiry,
  onDeleteListing,
  onDismiss,
}: {
  report: any;
  onDeleteItem: (fd: FormData) => Promise<void>;
  onDeleteInquiry: (fd: FormData) => Promise<void>;
  onDeleteListing: (fd: FormData) => Promise<void>;
  onDismiss: (fd: FormData) => Promise<void>;
}) {
  // 按 targetType 区分（item / inquiry / listing / application）
  const kind: 'item' | 'inquiry' | 'listing' | 'application' =
    report.itemId ? 'item'
    : report.inquiryId ? 'inquiry'
    : report.listingId ? 'listing'
    : 'application';
  const target =
    kind === 'item' ? report.item
    : kind === 'inquiry' ? report.inquiry
    : kind === 'listing' ? report.listing
    : null;

  if (!target) {
    return (
      <div className="bg-stone-100 rounded-lg p-3 text-sm flex items-center justify-between">
        <span className="text-stone-500">举报对象已被删除（孤儿记录）· {timeAgo(report.createdAt)}</span>
        <form action={onDismiss}>
          <input type="hidden" name="id" value={report.id} />
          <button className="text-xs text-stone-500 hover:text-stone-900 underline">清理</button>
        </form>
      </div>
    );
  }

  const kindLabel = kind === 'item' ? '商品举报' : kind === 'inquiry' ? '留言举报' : kind === 'listing' ? 'Listing 举报' : '申请举报';
  const kindAccent = kind === 'listing' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700';

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="flex items-center gap-2 text-xs text-stone-500 mb-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded-full font-medium ${kindAccent}`}>{kindLabel}</span>
        <span>· {timeAgo(report.createdAt)}</span>
        <span>· IP: <code className="bg-stone-100 px-1 rounded">{report.reporterIp ?? 'unknown'}</code></span>
      </div>

      {report.reason && (
        <div className="text-sm text-stone-700 mb-2">
          <strong>理由：</strong>{report.reason}
        </div>
      )}

      <div className="bg-stone-50 rounded p-3 mb-3 text-sm border border-stone-100">
        {kind === 'item' && (
          <>
            <div className="font-semibold text-stone-900">
              {target.title} — {formatPrice(target.price, 'zh', target.type, target.category)}
            </div>
            <div className="text-xs text-stone-500 mb-1">
              {categoryLabel(target.category)} · {target.contactType}: <code>{target.contactValue}</code>
            </div>
            {target.description && (
              <div className="text-xs text-stone-700 whitespace-pre-wrap mt-1">{target.description}</div>
            )}
          </>
        )}
        {kind === 'inquiry' && (
          <>
            <div className="text-xs text-stone-500 mb-1">
              {target.contactType}: <code>{target.contactValue}</code> 在 <strong>{target.item?.title}</strong> 留言
            </div>
            <div className="text-stone-700 whitespace-pre-wrap mt-1">{target.message}</div>
          </>
        )}
        {kind === 'listing' && (
          <>
            <div className="font-semibold text-stone-900">{target.title}</div>
            <div className="text-xs text-stone-500 mb-1">
              {target.type} · {target.posterGender ?? '—'} · {target.contactType}: <code>{target.contactValue}</code>
            </div>
            {target.description && (
              <div className="text-xs text-stone-700 whitespace-pre-wrap mt-1 line-clamp-3">{target.description}</div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2">
        {kind !== 'application' && (
          <form action={kind === 'item' ? onDeleteItem : kind === 'inquiry' ? onDeleteInquiry : onDeleteListing}>
            <input type="hidden" name="id" value={kind === 'item' ? report.itemId : kind === 'inquiry' ? report.inquiryId : report.listingId} />
            <button className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700">
              删除{kind === 'item' ? '商品' : kind === 'inquiry' ? '留言' : 'listing'}
            </button>
          </form>
        )}
        <form action={onDismiss}>
          <input type="hidden" name="id" value={report.id} />
          <button className="px-3 py-1.5 border border-stone-300 rounded text-sm text-stone-700 hover:bg-stone-100">
            驳回举报
          </button>
        </form>
      </div>
    </div>
  );
}

function HiddenItemCard({
  item,
  onUnhide,
  onDelete,
}: {
  item: any;
  onUnhide: (fd: FormData) => Promise<void>;
  onDelete: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="bg-white rounded-lg border border-amber-200 p-4">
      <div className="text-xs text-amber-700 mb-1">
        ⚠️ 被 3+ IP 举报后自动隐藏 · 隐藏于 {timeAgo(item.updatedAt)}
      </div>
      <div className="font-semibold mb-1">
        {item.title} — {formatPrice(item.price, 'zh', item.type, item.category)}
      </div>
      <div className="text-xs text-stone-500 mb-1">
        {categoryLabel(item.category)} · {item.contactType}: <code>{item.contactValue}</code>
      </div>
      {item.description && (
        <div className="text-xs text-stone-700 whitespace-pre-wrap mb-3">{item.description}</div>
      )}
      <div className="flex gap-2">
        <form action={onUnhide}>
          <input type="hidden" name="id" value={item.id} />
          <button className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">
            恢复显示
          </button>
        </form>
        <form action={onDelete}>
          <input type="hidden" name="id" value={item.id} />
          <button className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700">
            永久删除
          </button>
        </form>
      </div>
    </div>
  );
}

function HiddenListingCard({
  listing,
  onUnhide,
  onDelete,
}: {
  listing: any;
  onUnhide: (fd: FormData) => Promise<void>;
  onDelete: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="bg-white rounded-lg border border-amber-200 p-4">
      <div className="text-xs text-amber-700 mb-1">
        ⚠️ 被 3+ IP 举报后自动隐藏 · 隐藏于 {timeAgo(listing.updatedAt)}
      </div>
      <div className="font-semibold text-stone-900 mb-1">{listing.title}</div>
      <div className="text-xs text-stone-500 mb-2">
        类型: <code className="bg-stone-100 px-1 rounded">{listing.type}</code> ·
        性别: {listing.posterGender} ·
        {listing.contactType}: <code>{listing.contactValue}</code>
      </div>
      {listing.description && (
        <div className="text-sm text-stone-700 whitespace-pre-wrap mb-3 bg-stone-50 rounded p-2 border border-stone-100 line-clamp-4">
          {listing.description}
        </div>
      )}
      <div className="flex gap-2">
        <form action={onUnhide}>
          <input type="hidden" name="id" value={listing.id} />
          <button className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">
            恢复显示
          </button>
        </form>
        <form action={onDelete}>
          <input type="hidden" name="id" value={listing.id} />
          <button className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700">
            软删 listing
          </button>
        </form>
      </div>
    </div>
  );
}

function HiddenInquiryCard({
  inquiry,
  onUnhide,
  onDelete,
}: {
  inquiry: any;
  onUnhide: (fd: FormData) => Promise<void>;
  onDelete: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="bg-white rounded-lg border border-amber-200 p-4">
      <div className="text-xs text-amber-700 mb-1">
        ⚠️ 被 3+ IP 举报后自动隐藏 · 隐藏于 {timeAgo(inquiry.updatedAt)}
      </div>
      <div className="text-xs text-stone-500 mb-1">
        {inquiry.contactType}: <code>{inquiry.contactValue}</code>
        {inquiry.item && (
          <> · 在 <strong>{inquiry.item.title}</strong> 留言</>
        )}
      </div>
      <div className="text-sm text-stone-700 whitespace-pre-wrap mb-3 bg-stone-50 rounded p-2 border border-stone-100">
        {inquiry.message}
      </div>
      <div className="flex gap-2">
        <form action={onUnhide}>
          <input type="hidden" name="id" value={inquiry.id} />
          <button className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">
            恢复显示
          </button>
        </form>
        <form action={onDelete}>
          <input type="hidden" name="id" value={inquiry.id} />
          <button className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700">
            永久删除
          </button>
        </form>
      </div>
    </div>
  );
}
