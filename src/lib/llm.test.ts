import { describe, it, expect, vi, beforeEach } from 'vitest';

// 拦住 SDK:记录 create() 收到的请求体,不发网络
const create = vi.fn(async (_body: Record<string, unknown>) => ({ choices: [{ message: { content: '{"titleZh":"标题","descriptionZh":"描述"}' } }] }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
    embeddings = { create: vi.fn() };
  },
}));

const msgs = [{ role: 'user' as const, content: 'hi' }];

/** llm.ts 在模块加载时读 env,所以每个场景重新 import */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ['LLM_BASE_URL', 'LLM_CHAT_MODEL', 'LLM_UTILITY_MODEL']) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  return import('./llm');
}

const lastBody = () => create.mock.calls.at(-1)![0];

beforeEach(() => create.mockClear());

describe('buildChatRequestBody', () => {
  it('DeepSeek 场景带 thinking:disabled;模型名或 base URL 任一命中即可', async () => {
    const { buildChatRequestBody } = await load({});
    expect(buildChatRequestBody({ model: 'deepseek-flash', messages: msgs, disableThinking: true }, 'https://proxy.example.com/v1').thinking).toEqual({ type: 'disabled' });
    expect(buildChatRequestBody({ model: 'some-alias', messages: msgs, disableThinking: true }, 'https://api.deepseek.com').thinking).toEqual({ type: 'disabled' });
  });

  it('非 DeepSeek 场景不带该字段(连 key 都不出现,免得严格的 provider 400)', async () => {
    const { buildChatRequestBody } = await load({});
    const body = buildChatRequestBody({ model: 'gpt-4o-mini', messages: msgs, disableThinking: true }, 'https://api.openai.com/v1');
    expect('thinking' in body).toBe(false);
  });

  it('disableThinking 不传 → 不带', async () => {
    const { buildChatRequestBody } = await load({});
    expect('thinking' in buildChatRequestBody({ model: 'deepseek-flash', messages: msgs }, 'https://api.deepseek.com')).toBe(false);
  });
});

describe('发给 SDK 的请求体', () => {
  it('默认(DeepSeek):llmCall / utility / chat 都关 thinking,其余参数照传', async () => {
    const { llmCall, utility, chat } = await load({});
    await llmCall({ messages: msgs, temperature: 0.1, max_tokens: 8000, response_format: { type: 'json_object' } });
    expect(lastBody()).toMatchObject({ model: 'deepseek-v4-flash', temperature: 0.1, max_tokens: 8000, response_format: { type: 'json_object' }, thinking: { type: 'disabled' } });
    await utility({ messages: msgs });
    expect(lastBody().thinking).toEqual({ type: 'disabled' });
    await chat({ messages: msgs });
    expect(lastBody()).toMatchObject({ model: 'deepseek-v4-pro', thinking: { type: 'disabled' } });
  });

  it('thinking:true 显式要推理 → 不带 disabled,且 thinking 开关本身不漏进请求体', async () => {
    const { llmCall } = await load({});
    await llmCall({ messages: msgs, thinking: true });
    expect('thinking' in lastBody()).toBe(false);
  });

  it('extractJSON 与 translateToChineseSummary 走关闭路径', async () => {
    const { extractJSON, translateToChineseSummary } = await load({});
    await extractJSON({ html: '<p>x</p>', schemaDescription: '{}' });
    expect(lastBody()).toMatchObject({ max_tokens: 8000, thinking: { type: 'disabled' } });
    const t = await translateToChineseSummary({ title: 'Farmers Market' });
    expect(lastBody().thinking).toEqual({ type: 'disabled' });
    expect(t.titleZh).toBe('标题');
  });

  it('换成非 DeepSeek provider(base URL 与模型名都不含 deepseek)→ 请求体不带 thinking', async () => {
    const { utility, extractJSON } = await load({ LLM_BASE_URL: 'https://api.openai.com/v1', LLM_UTILITY_MODEL: 'gpt-4o-mini' });
    await utility({ messages: msgs });
    expect('thinking' in lastBody()).toBe(false);
    await extractJSON({ html: '<p>x</p>', schemaDescription: '{}' });
    expect('thinking' in lastBody()).toBe(false);
  });
});
