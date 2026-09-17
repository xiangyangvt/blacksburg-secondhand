import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity, isPostgresUrl, toVectorLiteral, createVectorStore,
  PgVectorStore, JsonVectorStore, type JsonVectorDb, type RawDb,
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
  const rows = new Map<string, { embeddingJson: string | null; embeddedAt: Date | null }>();
  const delegate = {
    async update({ where, data }: any) { rows.set(where.id, { ...(rows.get(where.id) ?? { embeddingJson: null, embeddedAt: null }), ...data }); },
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
    await s.upsert('item', 'a', unit(0));
    await s.upsert('item', 'b', unit(0, 0.5)); // 与 a 相似但不完全
    await s.upsert('item', 'c', unit(3));      // 正交
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
    expect(rows.get('a')).toEqual({ embeddingJson: null, embeddedAt: null });
  });

  it('坏 JSON / 错维度的行被跳过', async () => {
    const { db, rows } = memJsonDb();
    rows.set('bad', { embeddingJson: '{oops', embeddedAt: new Date() });
    rows.set('short', { embeddingJson: '[1,2,3]', embeddedAt: new Date() });
    const s = new JsonVectorStore(db);
    expect(await s.nearest('item', unit(0), { ids: ['bad', 'short'] }, 10)).toEqual([]);
  });

  it('维度不对直接抛(防止把错模型的向量写进库)', async () => {
    const s = new JsonVectorStore(memJsonDb().db);
    await expect(s.upsert('item', 'a', [1, 2, 3])).rejects.toThrow(/维度/);
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

  it('首次使用先幂等建 HNSW 索引,之后不再建', async () => {
    const { db, calls } = fakeRaw();
    const s = new PgVectorStore(db);
    await s.upsert('item', 'a', unit(0));
    await s.upsert('item', 'b', unit(1));
    const idx = calls.filter(c => c.sql.includes('CREATE INDEX IF NOT EXISTS'));
    expect(idx).toHaveLength(1);
    expect(idx[0]!.sql).toContain('"Item_embedding_hnsw" ON "Item" USING hnsw (embedding vector_cosine_ops)');
  });

  it('upsert / remove / nearest 的 SQL 形状与参数', async () => {
    const { db, calls } = fakeRaw();
    const s = new PgVectorStore(db);
    await s.upsert('listing', 'L1', unit(2));
    const up = calls.find(c => c.sql.startsWith('UPDATE "Listing" SET embedding = $1::vector'))!;
    expect(up.params[0]).toBe(toVectorLiteral(unit(2)));
    expect(up.params[1]).toBe('L1');
    expect(up.sql).toContain('"embeddedAt" = now()');

    await s.remove('event', 'E1');
    const rm = calls.find(c => c.sql.includes('SET embedding = NULL, "embeddedAt" = NULL'))!;
    expect(rm.sql).toContain('"Event"');
    expect(rm.params).toEqual(['E1']);

    const hits = await s.nearest('item', unit(0), { ids: ['a', 'b'] }, 5);
    const q = calls.find(c => c.sql.includes('1 - (embedding <=> $1::vector) AS similarity'))!;
    expect(q.sql).toContain('FROM "Item"');
    expect(q.sql).toContain('id = ANY($2::text[])');
    expect(q.sql).toContain('ORDER BY embedding <=> $1::vector');
    expect(q.params).toEqual([toVectorLiteral(unit(0)), ['a', 'b'], 5]);
    expect(hits).toEqual([{ id: 'a', similarity: 0.91 }, { id: 'b', similarity: 0.2 }]);
  });

  it('索引创建失败只 warn,不阻断写入', async () => {
    const calls: string[] = [];
    const db: RawDb = {
      async $executeRawUnsafe(sql) { calls.push(sql); if (sql.includes('CREATE INDEX')) throw new Error('no hnsw'); return 1; },
      async $queryRawUnsafe() { return [] as any; },
    };
    const s = new PgVectorStore(db);
    await expect(s.upsert('item', 'a', unit(0))).resolves.toBeUndefined();
    expect(calls.some(c => c.startsWith('UPDATE "Item"'))).toBe(true);
  });

  it('向量字面量格式与 NaN 拒绝', async () => {
    expect(toVectorLiteral([0.5, -1, 2])).toBe('[0.5,-1,2]');
    const s = new PgVectorStore(fakeRaw().db);
    const bad = unit(0); bad[7] = NaN;
    await expect(s.upsert('item', 'a', bad)).rejects.toThrow(/非有限数/);
  });
});
