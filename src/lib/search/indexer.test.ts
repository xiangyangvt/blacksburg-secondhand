import { describe, it, expect } from 'vitest';
import { needsReembed, embedOne, type IndexerDeps } from './indexer';
import type { VectorStore } from './vectorStore';
import { EMBED_DIM } from '@/lib/llm';

describe('needsReembed', () => {
  it('item:标题 / 描述 / 类目 / 标签 / 类型算,价格 / 联系方式 / 图片不算', () => {
    expect(needsReembed('item', { title: 'x' })).toBe(true);
    expect(needsReembed('item', { customTag: null })).toBe(true);
    expect(needsReembed('item', { price: 10 })).toBe(false);
    expect(needsReembed('item', { contactValue: 'wx', photoUrls: [] })).toBe(false);
    expect(needsReembed('item', { title: undefined })).toBe(false);
  });
  it('listing:区域 / 预算 / 户型算,生活习惯 / 联系方式不算', () => {
    expect(needsReembed('listing', { areas: ['Foxridge'] })).toBe(true);
    expect(needsReembed('listing', { budgetMax: 900 })).toBe(true);
    expect(needsReembed('listing', { smoking: 'no', contactValue: 'x' })).toBe(false);
  });
  it('event:地点 / 类别 / 开始时间算,昵称 / 人数不算', () => {
    expect(needsReembed('event', { location: 'x' })).toBe(true);
    expect(needsReembed('event', { startAt: null })).toBe(true);
    expect(needsReembed('event', { posterNickname: 'x', maxAttendees: 4 })).toBe(false);
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

function deps(over: Partial<IndexerDeps> & { logs?: string[]; ops?: string[] } = {}): IndexerDeps & { logs: string[]; ops: string[] } {
  const { store, ops } = fakeStore();
  const logs: string[] = [];
  return {
    loadText: async (k, id) => (id === 'missing' ? null : `${k} text for ${id}`),
    embed: async () => new Array(EMBED_DIM).fill(0.1),
    store: () => store,
    configured: () => true,
    log: (m) => logs.push(m),
    ...over,
    logs, ops,
  };
}

describe('embedOne', () => {
  it('正常路径:读文本 → embed → upsert', async () => {
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

  it('行不存在:skipped,不写', async () => {
    const d = deps();
    expect(await embedOne('event', 'missing', d)).toBe('skipped');
    expect(d.ops).toEqual([]);
  });

  it('embed API 失败:failed,一行日志,不抛', async () => {
    const d = deps({ embed: async () => { throw new Error('429 quota'); } });
    expect(await embedOne('listing', 'l1', d)).toBe('failed');
    expect(d.ops).toEqual([]);
    expect(d.logs[0]).toMatch(/429 quota/);
  });
});
