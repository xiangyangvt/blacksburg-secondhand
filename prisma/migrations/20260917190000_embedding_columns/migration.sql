-- Sprint 10A:语义搜索向量列(dev / SQLite)。生产 Postgres 走 schema.production.prisma 的 db push,
-- 对应列是 embedding vector(1536)(pgvector),不经本迁移。
-- AlterTable
ALTER TABLE "Item" ADD COLUMN "embeddingJson" TEXT;
ALTER TABLE "Item" ADD COLUMN "embeddedAt" DATETIME;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "embeddingJson" TEXT;
ALTER TABLE "Listing" ADD COLUMN "embeddedAt" DATETIME;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "embeddingJson" TEXT;
ALTER TABLE "Event" ADD COLUMN "embeddedAt" DATETIME;
