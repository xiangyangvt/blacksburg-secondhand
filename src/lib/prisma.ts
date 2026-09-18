import { PrismaClient } from '@prisma/client';

// 防止开发环境 hot-reload 创建多个实例
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Sprint 10A:dev / SQLite 的向量存在 embeddingJson 文本列(一条 ~30KB),全局 omit 掉,
// 否则任何 `...row` spread 的响应(列表 GET、发布回显、SSR)都会把它带出去。
// 显式 select 可以覆盖 omit(src/lib/search/vectorStore.ts 的 JsonVectorStore 就是这么读的)。
// 生产 Postgres 没有这列(是 Prisma 看不见的 Unsupported vector 列),omit 一个不存在的字段会在查询时报错,所以按后端分支。
// 类型上 dev / prod 客户端不同,这里按通用参数类型收窄,不让 omit 参与结果类型推断。
const isPostgres = /^postgres(ql)?:/i.test(process.env.DATABASE_URL ?? '');
const clientOptions = {
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  ...(isPostgres ? {} : { omit: { item: { embeddingJson: true }, listing: { embeddingJson: true }, event: { embeddingJson: true } } }),
} as unknown as ConstructorParameters<typeof PrismaClient>[0];

export const prisma = globalForPrisma.prisma ?? new PrismaClient(clientOptions);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
