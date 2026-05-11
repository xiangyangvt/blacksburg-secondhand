// 管理员后台 — 看举报、管隐藏商品、清理灌水
// 路由：/admin
// 认证：cookie（密码 = ADMIN_PASSWORD env var）
// robots.txt 已禁止抓取此路径

import { isAdmin, setAdminCookie, clearAdminCookie, getAdminPassword } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formatPrice, timeAgo, categoryLabel } from '@/lib/utils';

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
  await prisma.item.delete({ where: { id } });
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

  const [reports, hiddenItems, activeCount, inquiryCount, reportCount] = await Promise.all([
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
    prisma.item.count({ where: { status: 'active' } }),
    prisma.inquiry.count(),
    prisma.report.count(),
  ]);

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

      {/* 自动隐藏的商品 */}
      <section>
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
