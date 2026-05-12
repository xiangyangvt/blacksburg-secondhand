// 管理员后台 — 看举报、管隐藏商品、清理灌水
// 路由：/admin
// 认证：cookie（密码 = ADMIN_PASSWORD env var）
// robots.txt 已禁止抓取此路径

import { isAdmin, setAdminCookie, clearAdminCookie, getAdminPassword } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formatPrice, timeAgo, categoryLabel, parsePhotoUrls } from '@/lib/utils';
import { schedulePendingCloudinaryDeletion } from '@/lib/uploader';

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

/** 取消待删 — 删队列记录但不 destroy（图保留） */
async function cancelPendingDeletionAction(formData: FormData) {
  'use server';
  if (!isAdmin()) return;
  const id = String(formData.get('id'));
  await prisma.pendingCloudinaryDeletion.delete({ where: { id } });
  revalidatePath('/admin');
}

// ===== 主页面 =====
export default async function AdminPage({ searchParams }: { searchParams: { error?: string } }) {
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

  const [reports, hiddenItems, hiddenInquiries, activeCount, inquiryCount, reportCount] = await Promise.all([
    prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        item:    true,
        inquiry: { include: { item: true } },
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
    prisma.item.count({ where: { status: 'active' } }),
    prisma.inquiry.count(),
    prisma.report.count(),
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

  // 访问统计 —— 近 14 天每日浏览量 / 独立访客（JS 端聚合，避免 SQL 方言差异）
  const since14 = new Date(Date.now() - 14 * 86400e3);
  const views = await prisma.pageView.findMany({
    where: { createdAt: { gte: since14 } },
    select: { createdAt: true, visitorId: true },
    take: 50000, // 上限兜底
  });
  const buckets = new Map<string, { pageviews: number; visitors: Set<string> }>();
  // 预填充 14 天的空桶（保证 chart 连续）
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400e3);
    const day = d.toISOString().slice(0, 10);
    buckets.set(day, { pageviews: 0, visitors: new Set() });
  }
  for (const v of views) {
    const day = v.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(day);
    if (b) {
      b.pageviews += 1;
      b.visitors.add(v.visitorId);
    }
  }
  const trafficSeries = Array.from(buckets.entries()).map(([day, b]) => ({
    day,
    pageviews: b.pageviews,
    visitors: b.visitors.size,
  }));
  const totalPageviews = trafficSeries.reduce((s, d) => s + d.pageviews, 0);
  const allVisitorIds = new Set(views.map(v => v.visitorId));
  const totalUniqueVisitors = allVisitorIds.size;

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 bg-stone-50 min-h-screen">
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-stone-200">
        <div>
          <h1 className="text-2xl font-bold text-brand">🔧 管理后台</h1>
          <p className="text-xs text-stone-500 mt-1">仅你可见 — 不会被搜索引擎收录</p>
        </div>
        <form action={logoutAction}>
          <button className="text-sm text-stone-500 hover:text-stone-900 underline">退出</button>
        </form>
      </header>

      {/* 统计 */}
      <section className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="活跃商品" value={activeCount} />
        <StatCard label="留言总数" value={inquiryCount} />
        <StatCard label="累计举报" value={reportCount} />
      </section>

      {/* 访问统计柱状图 —— 自建埋点，跟用户内容计数分开展示 */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">📈 访问统计 · 近 14 天</h2>
        <TrafficChart
          series={trafficSeries}
          totalPageviews={totalPageviews}
          totalVisitors={totalUniqueVisitors}
        />
      </section>

      {/* 举报队列 */}
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
      <section>
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

/**
 * 访问统计柱状图 —— Railway 风格深色背景 + 渐变 bar
 * 设计：方便截图分享，单图自带 totals + 14 天分布
 */
function TrafficChart({
  series,
  totalPageviews,
  totalVisitors,
}: {
  series: Array<{ day: string; pageviews: number; visitors: number }>;
  totalPageviews: number;
  totalVisitors: number;
}) {
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

  // x 轴只标第一天 + 最后一天（中间太挤）
  const firstDay = series[0]?.day ?? '';
  const lastDay = series[series.length - 1]?.day ?? '';
  const fmtDay = (iso: string) => {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
  };

  return (
    <div className="bg-stone-950 rounded-card p-4 md:p-5 shadow-overlay">
      {/* 顶部 totals */}
      <div className="flex items-baseline gap-6 mb-3 flex-wrap">
        <div>
          <div className="text-xs text-stone-400 uppercase tracking-wide">浏览量</div>
          <div className="text-3xl font-bold text-white tabular-nums">{totalPageviews.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-stone-400 uppercase tracking-wide">独立访客</div>
          <div className="text-3xl font-bold text-white tabular-nums">{totalVisitors.toLocaleString()}</div>
        </div>
        <div className="ml-auto text-xs text-stone-500">近 14 天 · 黑堡二手 & 室友</div>
      </div>

      {/* SVG 柱状图 */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`近 14 天访问柱状图，总浏览量 ${totalPageviews}，独立访客 ${totalVisitors}`}
      >
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#5b21b6" />
          </linearGradient>
          <linearGradient id="visitGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#0369a1" />
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
            <g key={d.day}>
              {/* 浏览量（背景，紫色）*/}
              <rect
                x={x}
                y={PAD_TOP + chartH - pvH}
                width={barW}
                height={pvH}
                fill="url(#barGrad)"
                rx={2}
              >
                <title>{`${d.day}: ${d.pageviews} 浏览 · ${d.visitors} 访客`}</title>
              </rect>
              {/* 独立访客（前景，蓝色叠加，宽度更窄）*/}
              <rect
                x={x + barW * 0.25}
                y={PAD_TOP + chartH - vH}
                width={barW * 0.5}
                height={vH}
                fill="url(#visitGrad)"
                rx={1.5}
                opacity={0.85}
              />
            </g>
          );
        })}

        {/* x 轴日期标签：首尾 */}
        <text x={PAD_LEFT} y={H - 6} fontSize={10} fill="#71717a">{fmtDay(firstDay)}</text>
        <text x={W - PAD_RIGHT} y={H - 6} fontSize={10} fill="#71717a" textAnchor="end">{fmtDay(lastDay)}</text>
      </svg>

      {/* 图例 */}
      <div className="flex items-center gap-4 mt-2 text-xs text-stone-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'linear-gradient(180deg, #a78bfa, #5b21b6)' }} />
          浏览量 (PV)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'linear-gradient(180deg, #7dd3fc, #0369a1)' }} />
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
  onDismiss,
}: {
  report: any;
  onDeleteItem: (fd: FormData) => Promise<void>;
  onDeleteInquiry: (fd: FormData) => Promise<void>;
  onDismiss: (fd: FormData) => Promise<void>;
}) {
  const isItem = !!report.itemId;
  const target = isItem ? report.item : report.inquiry;
  if (!target) {
    // 目标已被删除，给个 dismiss 按钮清理这条孤儿举报
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

  return (
    <div className="bg-white rounded-lg border border-stone-200 p-4">
      <div className="flex items-center gap-2 text-xs text-stone-500 mb-2 flex-wrap">
        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
          {isItem ? '商品举报' : '留言举报'}
        </span>
        <span>· {timeAgo(report.createdAt)}</span>
        <span>· IP: <code className="bg-stone-100 px-1 rounded">{report.reporterIp ?? 'unknown'}</code></span>
      </div>

      {report.reason && (
        <div className="text-sm text-stone-700 mb-2">
          <strong>理由：</strong>{report.reason}
        </div>
      )}

      <div className="bg-stone-50 rounded p-3 mb-3 text-sm border border-stone-100">
        {isItem ? (
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
        ) : (
          <>
            <div className="text-xs text-stone-500 mb-1">
              {target.contactType}: <code>{target.contactValue}</code> 在 <strong>{target.item?.title}</strong> 留言
            </div>
            <div className="text-stone-700 whitespace-pre-wrap mt-1">{target.message}</div>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <form action={isItem ? onDeleteItem : onDeleteInquiry}>
          <input type="hidden" name="id" value={isItem ? report.itemId : report.inquiryId} />
          <button className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700">
            删除{isItem ? '商品' : '留言'}
          </button>
        </form>
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
