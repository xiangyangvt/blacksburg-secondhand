// 识别码找回管理页 (Sprint 6 UX-5)
// 独立子路由 /admin/recovery — 不动 1097 行的 admin/page.tsx
// Sean 在这里看待处理申请,人工核对后:
//   1. 复制申请人微信加好友
//   2. 验证身份(对方描述帖子细节)
//   3. 生成新 editCode 标 resolved + 复制给用户
//   4. 或拒绝(滥用)

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { RecoveryAdminPanel } from './RecoveryAdminPanel';

export const dynamic = 'force-dynamic';

export default async function RecoveryAdminPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  if (!isAdmin()) {
    redirect('/admin'); // 没登录走主 admin 入口
  }

  const status = searchParams.status ?? 'pending';
  const validStatus = ['pending', 'contacted', 'resolved', 'rejected', 'abuse', 'all'];
  const queryStatus = validStatus.includes(status) ? status : 'pending';

  const items = await prisma.recoveryRequest.findMany({
    where: queryStatus === 'all' ? {} : { status: queryStatus },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // 数 pending 给标签
  const pendingCount = queryStatus === 'pending'
    ? items.length
    : await prisma.recoveryRequest.count({ where: { status: 'pending' } });

  return (
    <main className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">识别码找回管理</h1>
            <p className="text-xs text-stone-500 mt-0.5">
              共 {pendingCount} 条待处理 ·{' '}
              <a href="/admin" className="text-brand hover:underline">← 回 admin 主页</a>
            </p>
          </div>
        </div>
      </header>
      <RecoveryAdminPanel initialItems={items} initialStatus={queryStatus} />
    </main>
  );
}
