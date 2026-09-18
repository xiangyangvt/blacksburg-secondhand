import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity, isPostgresUrl, toVectorLiteral, createVectorStore,
  PgVectorStore, JsonVectorStore, MAX_SOURCE_ROWS, type JsonVectorDb, type RawDb,
} from './vectorStore';
import { EMBED_DIM } from '@/lib/llm';

/** 1536 维单位向量:第 i 维为 1,其余 0;加一点扰动方便验证排序 */
function unit(i: number, noise = 0): number[] {
  const v = new Array(EMBED_DIM).fill(0);
  v[i] = 1;
  if (noise) v[(i + 1) % EMBED_DIM] = noise;
  return v;
}

describe('cosineSimilarity', () => {
  it('同向 1,正交 0,反向 -1', () => {
    expect(cosineSimilarity(unit(0), unit(0))).toBeCloseTo(1);
    expect(cosineSimilarity(unit(0), unit(1))).toBeCloseTo(0);
    expect(cosineSimilarity(unit(0), unit(0).map(x => -x))).toBeCloseTo(-1);
  });
  it('维度不等或零向量返回 0', () => {
    expect(cosineSimilarity([1, 0], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });
});

describe('后端选择', () => {
  it('按 DATABASE_URL 协议', () => {
    expect(isPostgresUrl('postgresql://u:p@h/db')).toBe(true);
    expect(isPostgresUrl('postgres://u:p@h/db')).toBe(true);
    expect(isPostgresUrl('file:./dev.db')).toBe(false);
    expect(isPostgresUrl(undefined)).toBe(false);
    expect(createVectorStore('postgresql://x').backend).toBe('pgvector');
    expect(createVectorStore('file:./dev.db').backend).toBe('json');
  });
});

function memJsonDb() {
  const rows = new Map<string, { embeddingJson: string | null; embeddedAt: Date | null; status: string; version: number }>();
  const blank = { embeddingJson: null, embeddedAt: null, status: 'active', version: 0 };
  const delegate = {
    async update({ where, data }: any) { rows.set(where.id, { ...(rows.get(where.id) ?? blank), ...data }); },
    async updateMany({ where, data }: any) {
      const r = rows.get(where.id) ?? blank;
      if (!where.status.in.includes(r.status) || where.embedVersion !== r.version) return { count: 0 };
      rows.set(where.id, { ...r, ...data }); return { count: 1 };
    },
    async findMany({ where }: any) {
      return [...rows.entries()]
        .filter(([id, r]) => where.id.in.includes(id) && r.embeddingJson !== null)
        .map(([id, r]) => ({ id, embeddingJson: r.embeddingJson }));
    },
  };
  const db = { item: delegate, listing: delegate, event: delegate } as unknown as JsonVectorDb;
  return { db, rows };
}

describe('JsonVectorStore', () => {
  it('upsert 写 JSON + embeddedAt;nearest 只在候选内按相似度排序;remove 清空', async () => {
    const { db, rows } = memJsonDb();
    const s = new JsonVectorStore(db);
    expect(await s.upsert('item', 'a', unit(0), 0)).toBe(true);
    await s.upsert('item', 'b', unit(0, 0.5), 0); // 与 a 相似但不完全
    await s.upsert('item', 'c', unit(3), 0);      // 正交
    expect(JSON.parse(rows.get('a')!.embeddingJson!)).toHaveLength(EMBED_DIM);
    expect(rows.get('a')!.embeddedAt).toBeInstanceOf(Date);

    const hits = await s.nearest('item', unit(0), { ids: ['a', 'b', 'c', 'zzz'] }, 10);
    expect(hits.map(h => h.id)).toEqual(['a', 'b', 'c']);
    expect(hits[0]!.similarity).toBeCloseTo(1);
    expect(hits[2]!.similarity).toBeCloseTo(0);

    // 候选过滤:a 不在候选里就不出现(先过滤后排序)
    const filtered = await s.nearest('item', unit(0), { ids: ['b', 'c'] }, 10);
    expect(filtered.map(h => h.id)).toEqual(['b', 'c']);

    // k 截断
    expect(await s.nearest('item', unit(0), { ids: ['a', 'b', 'c'] }, 1)).toHaveLength(1);
    // 空候选
    expect(await s.nearest('item', unit(0), { ids: [] }, 10)).toEqual([]);

    await s.remove('item', 'a');
    expect(rows.get('a')).toMatchObject({ embeddingJson: null, embeddedAt: null });
  });

  it('upsert 的 status + 版本守卫:已删除 / 隐藏 / 版本过期的行不写并返回 false(乱序防线)', async () => {
    const { db, rows } = memJsonDb();
    rows.set('gone', { embeddingJson: null, embeddedAt: null, status: 'deleted', version: 0 });
    rows.set('hid', { embeddingJson: null, embeddedAt: null, status: 'hidden', version: 0 });
    rows.set('draft', { embeddingJson: null, embeddedAt: null, status: 'draft', version: 0 });
    rows.set('edited', { embeddingJson: null, embeddedAt: null, status: 'active', version: 2 });
    const s = new JsonVectorStore(db);
    expect(await s.upsert('item', 'gone', unit(0), 0)).toBe(false);
    expect(await s.upsert('item', 'hid', unit(0), 0)).toBe(false);
    expect(await s.upsert('item', 'draft', unit(0), 0)).toBe(true);
    expect(await s.upsert('item', 'edited', unit(0), 1)).toBe(false); // 读时版本 1,库里已是 2
    expect(await s.upsert('item', 'edited', unit(0), 2)).toBe(true);
    expect(rows.get('gone')!.embeddingJson).toBeNull();
    expect(rows.get('hid')!.embeddingJson).toBeNull();
    expect(rows.get('draft')!.embeddingJson).not.toBeNull();
  });

  it('坏 JSON / 错维度的行被跳过', async () => {
    const { db, rows } = memJsonDb();
    rows.set('bad', { embeddingJson: '{oops', embeddedAt: new Date(), status: 'active', version: 0 });
    rows.set('short', { embeddingJson: '[1,2,3]', embeddedAt: new Date(), status: 'active', version: 0 });
    const s = new JsonVectorStore(db);
    expect(await s.nearest('item', unit(0), { ids: ['bad', 'short'] }, 10)).toEqual([]);
  });

  it('维度不对直接抛(防止把错模型的向量写进库)', async () => {
    const s = new JsonVectorStore(memJsonDb().db);
    await expect(s.upsert('item', 'a', [1, 2, 3], 0)).rejects.toThrow(/维度/);
  });
});

describe('nearestToRows(11B:以库里已有的行为引子)', () => {
  it('json:每个引子各取候选内前 k;没有向量的引子跳过;整体按相似度降序', async () => {
    const { db } = memJsonDb();
    const s = new JsonVectorStore(db);
    await s.upsert('item', 'sofa', unit(0), 0);
    await s.upsert('item', 'monitor', unit(5), 0);
    await s.upsert('item', 'couch', unit(0, 0.2), 0);   // 像 sofa
    await s.upsert('item', 'screen', unit(5, 0.4), 0);  // 像 monitor
    await s.upsert('item', 'bike', unit(9), 0);         // 谁都不像
    const hits = await s.nearestToRows('item', ['sofa', 'monitor', 'no-vector'], { ids: ['couch', 'screen', 'bike'] }, 1);
    expect(hits.map(h => `${h.sourceId}>${h.id}`)).toEqual(['sofa>couch', 'monitor>screen']);
    expect(hits[0]!.similarity).toBeGreaterThan(hits[1]!.similarity);
    expect(await s.nearestToRows('item', [], { ids: ['couch'] }, 3)).toEqual([]);
    expect(await s.nearestToRows('item', ['sofa'], { ids: [] }, 3)).toEqual([]);
  });

  it('pgvector:自连接 + 窗口函数,精确排序,不跑 DDL;引子数量封顶', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const db: RawDb = {
      async $executeRawUnsafe(sql, ...params) { calls.push({ sql, params }); return 1; },
      async $queryRawUnsafe(sql, ...params) { calls.push({ sql, params }); return [{ sourceId: 's1', id: 'c1', similarity: '0.8' }] as any; },
    };
    const s = new PgVectorStore(db);
    const many = Array.from({ length: MAX_SOURCE_ROWS + 5 }, (_, i) => `s${i}`);
    const hits = await s.nearestToRows('item', many, { ids: ['c1', 'c2'] }, 6);
    expect(hits).toEqual([{ sourceId: 's1', id: 'c1', similarity: 0.8 }]);
    expect(calls).toHaveLength(1);
    const q = calls[0]!;
    expect(q.sql).toContain('row_number() OVER (PARTITION BY s.id ORDER BY c.embedding <=> s.embedding ASC)');
    expect(q.sql).toContain('s.id = ANY($1::text[])');
    expect(q.sql).toContain('c.id = ANY($2::text[])');
    expect(q.sql).toContain('WHERE rn <= $3');
    expect(q.sql).not.toContain('CREATE INDEX');
    expect((q.params[0] as string[]).length).toBe(MAX_SOURCE_ROWS);
    expect(q.params.slice(1)).toEqual([['c1', 'c2'], 6]);
  });
});

describe('PgVectorStore(SQL 层)', () => {
  function fakeRaw() {
    const calls: { sql: string; params: unknown[] }[] = [];
    const db: RawDb = {
      async $executeRawUnsafe(sql, ...params) { calls.push({ sql, params }); return 1; },
      async $queryRawUnsafe(sql, ...params) {
        calls.push({ sql, params });
        return [{ id: 'a', similarity: '0.91' }, { id: 'b', similarity: 0.2 }] as any;
      },
    };
    return { db, calls };
  }

  it('请求路径(upsert / nearest)不跑 DDL;ensureIndex 用 CONCURRENTLY 幂等建,并发共用一次', async () => {
    const { db, calls } = fakeRaw();
    const s = new PgVectorStore(db);
    await s.upsert('item', 'a', unit(0), 0);
    await s.nearest('item', unit(0), { ids: ['a'] }, 1);
    expect(calls.some(c => c.sql.includes('CREATE INDEX'))).toBe(false);
    await Promise.all([s.ensureIndex('item'), s.ensureIndex('item'), s.ensureIndex('listing')]);
    const idx = calls.filter(c => c.sql.includes('CREATE INDEX'));
    expect(idx).toHaveLength(2);
    expect(idx[0]!.sql).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS "Item_embedding_hnsw" ON "Item" USING hnsw (embedding vector_cosine_ops)');
  });

  it('upsert / remove / nearest 的 SQL 形状与参数', async () => {
    const { db, calls } = fakeRaw();
    const s = new PgVectorStore(db);
    expect(await s.upsert('listing', 'L1', unit(2), 7)).toBe(true);
    const up = calls.find(c => c.sql.startsWith('UPDATE "Listing" SET embedding = $1::vector'))!;
    expect(up.params[0]).toBe(toVectorLiteral(unit(2)));
    expect(up.params[1]).toBe('L1');
    expect(up.params[2]).toEqual(['active', 'draft']); // status 守卫
    expect(up.params[3]).toBe(7);                      // 版本守卫
    expect(up.sql).toContain('"embeddedAt" = now()');
    expect(up.sql).toContain('AND status = ANY($3::text[]) AND "embedVersion" = $4');

    await s.remove('event', 'E1');
    const rm = calls.find(c => c.sql.includes('SET embedding = NULL, "embeddedAt" = NULL'))!;
    expect(rm.sql).toContain('"Event"');
    expect(rm.params).toEqual(['E1']);

    const hits = await s.nearest('item', unit(0), { ids: ['a', 'b'] }, 5);
    const q = calls.find(c => c.sql.includes('1 - dist AS similarity'))!;
    expect(q.sql).toContain('FROM "Item"');
    expect(q.sql).toContain('id = ANY($2::text[])');
    expect(q.sql).toContain('embedding <=> $1::vector AS dist');
    expect(q.sql).toMatch(/OFFSET 0\) s\s+ORDER BY dist ASC/); // 优化栅栏:先过滤后精确排序,不走 HNSW 近似
    expect(q.params).toEqual([toVectorLiteral(unit(0)), ['a', 'b'], 5]);
    expect(hits).toEqual([{ id: 'a', similarity: 0.91 }, { id: 'b', similarity: 0.2 }]);
  });

  it('UPDATE 影响 0 行 → upsert 返回 false', async () => {
    const db: RawDb = { async $executeRawUnsafe() { return 0; }, async $queryRawUnsafe() { return [] as any; } };
    expect(await new PgVectorStore(db).upsert('item', 'a', unit(0), 1)).toBe(false);
  });

  it('索引创建失败只 warn 不抛,且下次可重试', async () => {
    let n = 0;
    const db: RawDb = {
      async $executeRawUnsafe(sql) { if (sql.includes('CREATE INDEX') && n++ === 0) throw new Error('no hnsw'); return 1; },
      async $queryRawUnsafe() { return [] as any; },
    };
    const s = new PgVectorStore(db);
    await expect(s.ensureIndex('item')).resolves.toBeUndefined();
    await expect(s.ensureIndex('item')).resolves.toBeUndefined();
    expect(n).toBe(2);
  });

  it('向量字面量格式与 NaN 拒绝', async () => {
    expect(toVectorLiteral([0.5, -1, 2])).toBe('[0.5,-1,2]');
    const s = new PgVectorStore(fakeRaw().db);
    const bad = unit(0); bad[7] = NaN;
    await expect(s.upsert('item', 'a', bad, 0)).rejects.toThrow(/非有限数/);
  });
});
