import { describe, it, expect } from 'vitest';
import { substantiveChanged, valueEq, embedOne, type IndexerDeps, type EmbedSnapshot } from './indexer';
import type { VectorStore } from './vectorStore';
import { EMBED_DIM } from '@/lib/llm';

describe('valueEq', () => {
  it('Date 按时间比,null/undefined 等价,对象按 JSON', () => {
    expect(valueEq(new Date(1000), new Date(1000))).toBe(true);
    expect(valueEq(new Date(1000), new Date(2000))).toBe(false);
    expect(valueEq(null, undefined)).toBe(true);
    expect(valueEq(null, 'x')).toBe(false);
    expect(valueEq(['a'], ['a'])).toBe(true);
    expect(valueEq('a', 'b')).toBe(false);
  });
});

describe('substantiveChanged(比较新旧值,不是看字段有没有传)', () => {
  const item = { title: '沙发', description: '九成新', category: 'home', customTag: '家具', type: 'sell', price: 30, contactValue: 'wx' };

  it('编辑表单原样提交完整字段 → 不重算', () => {
    expect(substantiveChanged('item', item, { ...item })).toBe(false);
  });
  it('完整字段里只改价格 / 联系方式 / 图片 → 不重算', () => {
    expect(substantiveChanged('item', item, { ...item, price: 25, contactValue: 'wx2', photoUrls: '[]' })).toBe(false);
  });
  it('标题 / 描述 / 类目 / 标签 / 类型任一真的变了 → 重算', () => {
    expect(substantiveChanged('item', item, { ...item, title: '沙发 sofa' })).toBe(true);
    expect(substantiveChanged('item', item, { customTag: null })).toBe(true);
    expect(substantiveChanged('item', item, { type: 'buy' })).toBe(true);
  });
  it('未传(undefined)不算', () => {
    expect(substantiveChanged('item', item, { title: undefined, price: 1 })).toBe(false);
  });
  it('listing:areas JSON 字符串相等不重算,预算变了重算;生活习惯不算', () => {
    const l = { title: 't', description: 'd', type: 'sublet', areas: '["Foxridge"]', budgetMin: 500, budgetMax: 800, hasPlace: true, housingLayout: '2b2b', furnished: true, moveInFuzzy: null, smoking: 'no' };
    expect(substantiveChanged('listing', l, { ...l, smoking: 'ok' })).toBe(false);
    expect(substantiveChanged('listing', l, { ...l, budgetMax: 900 })).toBe(true);
    expect(substantiveChanged('listing', l, { areas: '["Downtown"]' })).toBe(true);
  });
  it('event:startAt 同一时刻的新 Date 不重算;地点变了重算;昵称 / 人数不算', () => {
    const e = { title: 't', description: 'd', location: 'VT', category: 'exercise', customCategory: null, startAt: new Date('2026-09-20T14:00:00Z'), posterNickname: 'a', maxAttendees: 4 };
    expect(substantiveChanged('event', e, { ...e, startAt: new Date('2026-09-20T14:00:00Z'), posterNickname: 'b', maxAttendees: 6 })).toBe(false);
    expect(substantiveChanged('event', e, { location: 'Downtown' })).toBe(true);
    expect(substantiveChanged('event', e, { startAt: null })).toBe(true);
  });
});

function fakeStore() {
  const ops: string[] = [];
  const store: VectorStore = {
    backend: 'json',
    async upsert(kind, id, v) { ops.push(`upsert ${kind}:${id}:${v.length}`); },
    async remove(kind, id) { ops.push(`remove ${kind}:${id}`); },
    async nearest() { return []; },
  };
  return { store, ops };
}

type Deps = IndexerDeps & { logs: string[]; ops: string[] };

function deps(over: Partial<IndexerDeps> = {}): Deps {
  const { store, ops } = fakeStore();
  const logs: string[] = [];
  return {
    load: async (k, id): Promise<EmbedSnapshot | null> => (id === 'missing' ? null : { text: `${k} text for ${id}`, status: 'active' }),
    embed: async () => new Array(EMBED_DIM).fill(0.1),
    store: () => store,
    configured: () => true,
    log: (m) => logs.push(m),
    ...over,
    logs, ops,
  };
}

describe('embedOne', () => {
  it('正常路径:读文本 → embed → 复核未变 → upsert', async () => {
    const d = deps();
    expect(await embedOne('item', 'i1', d)).toBe('ok');
    expect(d.ops).toEqual(['upsert item:i1:1536']);
  });

  it('key 未配:跳过,一行 warn,不调 embed', async () => {
    let embedCalls = 0;
    const d = deps({ configured: () => false, embed: async () => { embedCalls++; return []; } });
    expect(await embedOne('item', 'i1', d)).toBe('skipped');
    expect(embedCalls).toBe(0);
    expect(d.logs).toHaveLength(1);
    expect(d.logs[0]).toMatch(/LLM_EMBED_API_KEY/);
  });

  it('行不存在 / 状态不可检索:skipped,不写', async () => {
    const d = deps();
    expect(await embedOne('event', 'missing', d)).toBe('skipped');
    const hidden = deps({ load: async () => ({ text: 'x', status: 'hidden' }) });
    expect(await embedOne('item', 'h', hidden)).toBe('skipped');
    expect(d.ops).toEqual([]);
    expect(hidden.ops).toEqual([]);
  });

  it('乱序防线:embed 期间文本被改 → 放弃本次结果,不写旧向量', async () => {
    let n = 0;
    const d = deps({ load: async () => ({ text: n++ === 0 ? '版本 A' : '版本 B', status: 'active' }) });
    expect(await embedOne('item', 'i1', d)).toBe('skipped');
    expect(d.ops).toEqual([]);
    expect(d.logs[0]).toMatch(/放弃本次结果/);
  });

  it('乱序防线:embed 期间被删除 → 不写回', async () => {
    let n = 0;
    const d = deps({ load: async () => ({ text: '同一文本', status: n++ === 0 ? 'active' : 'deleted' }) });
    expect(await embedOne('listing', 'l1', d)).toBe('skipped');
    expect(d.ops).toEqual([]);
  });

  it('embed API 失败:failed,一行日志,不抛', async () => {
    const d = deps({ embed: async () => { throw new Error('429 quota'); } });
    expect(await embedOne('listing', 'l1', d)).toBe('failed');
    expect(d.ops).toEqual([]);
    expect(d.logs[0]).toMatch(/429 quota/);
  });
});
