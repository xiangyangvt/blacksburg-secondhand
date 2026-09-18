#!/usr/bin/env node
// Sprint 9F:两份 Prisma schema(dev SQLite / prod Postgres)必须字段级一致。
// 归一化:去注释、去 datasource/generator 块、压空白,然后逐行 diff。
// 允许的差异只在 datasource/generator(provider、url、binaryTargets、extensions、previewFeatures),
// 外加下面 ALLOWED_PAIRS 里逐对列出的字段级豁免(Sprint 10A:SQLite 没有 vector 类型)。
// 退出码 1 = 不一致(CI 红)。用法:node scripts/check-schema-sync.mjs
import { readFileSync } from 'node:fs';

// [dev 行, prod 行](归一化后)。只有这几对允许不同,其余任何差异仍然红。
const ALLOWED_PAIRS = [
  ['embeddingJson String?', 'embedding Unsupported("vector(1536)")?'],
];
const isAllowed = (dev, prod) => ALLOWED_PAIRS.some(([d, p]) => d === dev && p === prod);

const files = ['prisma/schema.prisma', 'prisma/schema.production.prisma'];

function normalize(src) {
  const out = [];
  let depth = 0;
  let skipBlock = false;
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (depth === 0 && /^(datasource|generator)\s+\w+\s*\{/.test(line)) { skipBlock = true; }
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    if (!skipBlock) out.push(line.replace(/\s+/g, ' '));
    depth += opens - closes;
    if (skipBlock && depth === 0) skipBlock = false;
  }
  return out;
}

const [a, b] = files.map(f => normalize(readFileSync(f, 'utf8')));
const max = Math.max(a.length, b.length);
const diffs = [];
for (let i = 0; i < max; i++) if (a[i] !== b[i] && !isAllowed(a[i], b[i])) diffs.push({ line: i + 1, dev: a[i] ?? '<EOF>', prod: b[i] ?? '<EOF>' });

if (diffs.length) {
  console.error(`✗ schema 不一致:${diffs.length} 处(归一化后行号)`);
  for (const d of diffs.slice(0, 20)) console.error(`  #${d.line}\n    dev : ${d.dev}\n    prod: ${d.prod}`);
  process.exit(1);
}
const exempt = a.filter((l, i) => l !== b[i]).length;
console.log(`✓ schema 一致(${a.length} 行归一化内容,${exempt} 行白名单豁免)`);
