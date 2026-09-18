// Sprint 10A:回填 embedding(本地 / CI 用;生产库本地连不到,Railway 上走 POST /api/admin/backfill-embeddings)
//
// 用法:npm run backfill:embeddings            全部类型,跑到没有为止
//       npm run backfill:embeddings -- item    只跑一种
// 可重复执行(幂等)、可 Ctrl-C 中断后续跑。需要 .env 里 LLM_EMBED_API_KEY;没有则直接退出不动库。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// tsx 不加载 .env;Prisma 自己会读 DATABASE_URL,但 LLM_EMBED_* 得我们读。不覆盖已有环境变量。
function loadDotenv() {
  try {
    for (const raw of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch { /* 没有 .env 也行 */ }
}
loadDotenv();

async function main() {
  const { isEmbedConfigured } = await import('../src/lib/llm');
  const { EMBED_KINDS } = await import('../src/lib/search/embedText');
  const { backfillEmbeddings, countPending } = await import('../src/lib/search/backfill');
  const { getVectorStore } = await import('../src/lib/search/vectorStore');

  if (!isEmbedConfigured()) {
    console.error('LLM_EMBED_API_KEY 未配,退出(不动库)');
    process.exit(2);
  }
  const arg = process.argv[2];
  const kinds = arg ? EMBED_KINDS.filter(k => k === arg) : EMBED_KINDS;
  if (kinds.length === 0) {
    console.error(`未知类型 ${arg},可选:${EMBED_KINDS.join(' | ')}`);
    process.exit(2);
  }

  console.log(`后端:${getVectorStore().backend};待回填:`, await countPending());
  const t0 = Date.now();
  const r = await backfillEmbeddings({ kinds, log: m => console.log(m) });
  console.log(JSON.stringify({ ...r, seconds: Math.round((Date.now() - t0) / 100) / 10 }, null, 2));
  console.log(`剩余待回填:`, await countPending());
  process.exit(r.done ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
