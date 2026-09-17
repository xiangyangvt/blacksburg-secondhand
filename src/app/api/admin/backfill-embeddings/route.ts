// Sprint 10A:在 Railway 上触发 embedding 回填(本地连不到生产库)
//
// GET  预览:后端类型、key 是否配、各类型待回填数;pgvector 时顺便探测扩展与 HNSW 索引是否存在
//      (这就是 spec 验收里 `\dx` 的替代证据,curl 一下贴到 PR)
// POST 跑回填:body { kinds?: ['item'|'listing'|'event'], maxBatches?: number(默认 10,每批 ≤ 50 条) }
//      单次请求最多 10 批 × 3 类型,避免撞 Railway 请求超时;done=false 就再 POST 一次
//
// 鉴权:admin cookie(9E 签名令牌)。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/adminAuth';
import { isEmbedConfigured } from '@/lib/llm';
import { EMBED_KINDS, type EmbedKind } from '@/lib/search/embedText';
import { backfillEmbeddings, countPending } from '@/lib/search/backfill';
import { getVectorStore, TABLE } from '@/lib/search/vectorStore';

export const dynamic = 'force-dynamic';

async function probePgvector() {
  try {
    const ext = await prisma.$queryRawUnsafe<{ extname: string; extversion: string }[]>(
      `SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`,
    );
    const idx = await prisma.$queryRawUnsafe<{ tablename: string; indexname: string }[]>(
      `SELECT tablename, indexname FROM pg_indexes WHERE indexname = ANY($1::text[])`,
      Object.values(TABLE).map(t => `${t}_embedding_hnsw`),
    );
    return { extension: ext[0] ?? null, hnswIndexes: idx };
  } catch (e) {
    return { error: (e as Error)?.message ?? String(e) };
  }
}

export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const store = getVectorStore();
  return NextResponse.json({
    backend: store.backend,
    embedConfigured: isEmbedConfigured(),
    pending: await countPending(),
    ...(store.backend === 'pgvector' ? { pgvector: await probePgvector() } : {}),
  });
}

export async function POST(req: NextRequest) {
  if (!isAdmin()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isEmbedConfigured()) return NextResponse.json({ error: 'LLM_EMBED_API_KEY 未配' }, { status: 503 });

  let body: any = {};
  try { body = await req.json(); } catch { /* 空 body 也行 */ }
  const kinds: EmbedKind[] = Array.isArray(body.kinds)
    ? EMBED_KINDS.filter(k => body.kinds.includes(k))
    : [...EMBED_KINDS];
  const maxBatches = Math.min(Math.max(Number(body.maxBatches) || 10, 1), 50);

  const logs: string[] = [];
  const t0 = Date.now();
  const result = await backfillEmbeddings({ kinds, maxBatches, log: m => logs.push(m) });
  return NextResponse.json({
    ...result,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
    remaining: await countPending(),
    logs: logs.slice(-30),
  });
}
