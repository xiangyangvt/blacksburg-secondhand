// Sprint 10A:向量存储抽象
//
// 两个实现,按 DATABASE_URL 协议自动选:
//   pgvector    生产 Postgres。raw SQL,`<=>` 余弦距离,HNSW 索引(vector_cosine_ops)。
//               embedding 列是 Prisma Unsupported 类型,客户端 API 看不见它,所以只能 raw。
//   json        dev / SQLite。向量存 embeddingJson 文本列,JS 端算余弦;数据量小(几百条)可接受。
//
// nearest 的过滤是"先过滤后排序":候选 id 由调用方用与列表接口相同的 Prisma where 查出(10B 复用),
// 这里只在候选集合内排序。与 spec 的 filterSql 相比,好处是两个后端共用同一份过滤逻辑,不用维护两套 SQL。
//
// 表名 / 列名来自固定映射,不接用户输入,所以 $executeRawUnsafe 只是"表名当参数"的写法,不是注入面。

import { prisma } from '@/lib/prisma';
import { EMBED_DIM } from '@/lib/llm';
import type { EmbedKind } from './embedText';

export interface NearestHit {
  id: string;
  /** 余弦相似度,[-1, 1],越大越像 */
  similarity: number;
}

export interface NearestFilter {
  /** 候选 id(已按 status / 类目 / 价格 / 时间过滤)。空数组直接返回 [] */
  ids: readonly string[];
}

export interface VectorStore {
  readonly backend: 'pgvector' | 'json';
  /** 只对仍可检索(status ∈ SEARCHABLE_STATUSES)的行写入;行已删除 / 隐藏则静默不写(乱序防线,互审 #1) */
  upsert(kind: EmbedKind, id: string, vector: number[]): Promise<void>;
  remove(kind: EmbedKind, id: string): Promise<void>;
  nearest(kind: EmbedKind, vector: number[], filter: NearestFilter, k: number): Promise<NearestHit[]>;
  /** 可选:建索引等一次性维护,只在回填 / admin 路径调,不在请求路径调 DDL(互审 #3) */
  ensureIndex?(kind: EmbedKind): Promise<void>;
}

export const TABLE: Record<EmbedKind, string> = { item: 'Item', listing: 'Listing', event: 'Event' };

/** 向量只为这些状态的行维护;其余状态靠查询侧的 status 过滤,不必逐个清 */
export const SEARCHABLE_STATUSES = ['active', 'draft'] as const;

export function isPostgresUrl(url: string | undefined = process.env.DATABASE_URL): boolean {
  return /^postgres(ql)?:/i.test(url ?? '');
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function assertDim(v: readonly number[]): void {
  if (v.length !== EMBED_DIM) throw new Error(`vector 维度 ${v.length} ≠ ${EMBED_DIM}`);
  for (const x of v) if (!Number.isFinite(x)) throw new Error('vector 含非有限数');
}

// ---------- pgvector ----------

/** pgvector 文本字面量:'[0.1,0.2,...]'。数字经 Number.isFinite 校验,不存在注入 */
export function toVectorLiteral(v: readonly number[]): string {
  return `[${v.join(',')}]`;
}

/** 最小化的 raw 接口,方便单测注入 */
export interface RawDb {
  $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(sql: string, ...params: unknown[]): Promise<T>;
}

export class PgVectorStore implements VectorStore {
  readonly backend = 'pgvector' as const;
  private indexing = new Map<EmbedKind, Promise<void>>();

  constructor(private db: RawDb = prisma as unknown as RawDb) {}

  /**
   * HNSW 索引 Prisma schema 不能声明(索引类型不在其枚举里),这里幂等创建。
   * 只由回填脚本 / admin 接口调用,**不在发布请求路径里跑 DDL**;用 CONCURRENTLY 不阻塞同表写入(互审 #3)。
   * 并发调用共用一个进行中的 Promise。失败只 warn:没有索引 pgvector 退化为顺序扫描,结果一样,只是慢。
   * 若 preDeploy 的 db push 把它当 drift 删掉,下次回填会再建;几百行数据建索引是毫秒级。
   */
  ensureIndex(kind: EmbedKind): Promise<void> {
    let p = this.indexing.get(kind);
    if (!p) {
      const t = TABLE[kind];
      p = this.db.$executeRawUnsafe(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${t}_embedding_hnsw" ON "${t}" USING hnsw (embedding vector_cosine_ops)`,
      ).then(() => undefined, (e: unknown) => {
        console.warn(`[vectorStore] ${t} HNSW 索引创建失败(继续,无索引也能查):`, (e as Error)?.message ?? e);
        this.indexing.delete(kind); // 下次再试
      });
      this.indexing.set(kind, p);
    }
    return p;
  }

  async upsert(kind: EmbedKind, id: string, vector: number[]): Promise<void> {
    assertDim(vector);
    await this.db.$executeRawUnsafe(
      `UPDATE "${TABLE[kind]}" SET embedding = $1::vector, "embeddedAt" = now() WHERE id = $2 AND status = ANY($3::text[])`,
      toVectorLiteral(vector), id, [...SEARCHABLE_STATUSES],
    );
  }

  async remove(kind: EmbedKind, id: string): Promise<void> {
    await this.db.$executeRawUnsafe(
      `UPDATE "${TABLE[kind]}" SET embedding = NULL, "embeddedAt" = NULL WHERE id = $1`,
      id,
    );
  }

  /**
   * 先过滤后精确排序。内层子查询带 OFFSET 0 作优化栅栏,阻止规划器把它拉平后改走 HNSW 近似扫描——
   * HNSW 是"先取近邻再过滤",候选集合小的时候会漏结果甚至返回 0 条(互审 #7,pgvector 文档 Filtering 一节)。
   * 候选几百行时顺序算距离是微秒级;HNSW 索引留给以后无候选过滤的全局查询用。
   */
  async nearest(kind: EmbedKind, vector: number[], filter: NearestFilter, k: number): Promise<NearestHit[]> {
    if (filter.ids.length === 0 || k <= 0) return [];
    assertDim(vector);
    const rows = await this.db.$queryRawUnsafe<{ id: string; similarity: number | string }[]>(
      `SELECT id, 1 - dist AS similarity
         FROM (SELECT id, embedding <=> $1::vector AS dist
                 FROM "${TABLE[kind]}"
                WHERE embedding IS NOT NULL AND id = ANY($2::text[])
               OFFSET 0) s
        ORDER BY dist ASC
        LIMIT $3`,
      toVectorLiteral(vector), [...filter.ids], k,
    );
    return rows.map(r => ({ id: r.id, similarity: Number(r.similarity) }));
  }
}

// ---------- json(dev / SQLite) ----------

interface JsonRow { id: string; embeddingJson: string | null }

/** 只用到三个 delegate 的两个方法;prod 客户端没有 embeddingJson 字段,所以经 unknown 强转,不直接依赖生成类型 */
export interface JsonVectorDelegate {
  update(args: { where: { id: string }; data: { embeddingJson: string | null; embeddedAt: Date | null } }): Promise<unknown>;
  updateMany(args: { where: { id: string; status: { in: string[] } }; data: { embeddingJson: string | null; embeddedAt: Date | null } }): Promise<unknown>;
  findMany(args: { where: { id: { in: string[] }; embeddingJson: { not: null } }; select: { id: true; embeddingJson: true } }): Promise<JsonRow[]>;
}
export type JsonVectorDb = Record<EmbedKind, JsonVectorDelegate>;

/** SQLite 绑定变量上限 999,`id IN (...)` 分片 */
const IN_CHUNK = 500;

export class JsonVectorStore implements VectorStore {
  readonly backend = 'json' as const;

  constructor(private db: JsonVectorDb = prisma as unknown as JsonVectorDb) {}

  async upsert(kind: EmbedKind, id: string, vector: number[]): Promise<void> {
    assertDim(vector);
    await this.db[kind].updateMany({
      where: { id, status: { in: [...SEARCHABLE_STATUSES] } },
      data: { embeddingJson: JSON.stringify(vector), embeddedAt: new Date() },
    });
  }

  async remove(kind: EmbedKind, id: string): Promise<void> {
    await this.db[kind].update({ where: { id }, data: { embeddingJson: null, embeddedAt: null } });
  }

  async nearest(kind: EmbedKind, vector: number[], filter: NearestFilter, k: number): Promise<NearestHit[]> {
    if (filter.ids.length === 0 || k <= 0) return [];
    assertDim(vector);
    const hits: NearestHit[] = [];
    for (let i = 0; i < filter.ids.length; i += IN_CHUNK) {
      const rows = await this.db[kind].findMany({
        where: { id: { in: filter.ids.slice(i, i + IN_CHUNK) }, embeddingJson: { not: null } },
        select: { id: true, embeddingJson: true },
      });
      for (const r of rows) {
        let v: unknown;
        try { v = JSON.parse(r.embeddingJson ?? ''); } catch { continue; }
        if (!Array.isArray(v) || v.length !== EMBED_DIM) continue;
        hits.push({ id: r.id, similarity: cosineSimilarity(vector, v as number[]) });
      }
    }
    hits.sort((a, b) => b.similarity - a.similarity);
    return hits.slice(0, k);
  }
}

// ---------- 选择 ----------

let singleton: VectorStore | undefined;

export function createVectorStore(databaseUrl = process.env.DATABASE_URL): VectorStore {
  return isPostgresUrl(databaseUrl) ? new PgVectorStore() : new JsonVectorStore();
}

export function getVectorStore(): VectorStore {
  return (singleton ??= createVectorStore());
}
