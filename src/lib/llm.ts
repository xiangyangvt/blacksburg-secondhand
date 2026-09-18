// LLM provider 抽象 (Sprint 7 Phase 1.2)
// 用 openai SDK 包一层 —— DeepSeek / OpenAI / Anthropic-router 都用 OpenAI 兼容协议
// 切 provider 改 env,业务代码不动
//
// env:
//   LLM_BASE_URL          chat/utility 走的 endpoint(默认 deepseek)
//   LLM_API_KEY
//   LLM_CHAT_MODEL        给 RAG chatbot 用(deepseek-v4-pro,promo $0.435/$0.87 per M)
//   LLM_UTILITY_MODEL     给批量 extract/translate 用(deepseek-v4-flash,$0.14/$0.28 per M)
//   LLM_EMBED_BASE_URL    embedding 独立(默认 OpenAI;DeepSeek 暂无 embed 模型)
//   LLM_EMBED_API_KEY
//   LLM_EMBED_MODEL       默认 text-embedding-3-small($0.02 per M, 1536 维)

import OpenAI from 'openai';

// ---------- clients ----------

const chatClient = new OpenAI({
  baseURL: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com',
  apiKey: process.env.LLM_API_KEY ?? '',
});

const embedClient = new OpenAI({
  baseURL: process.env.LLM_EMBED_BASE_URL ?? 'https://api.openai.com/v1',
  apiKey: process.env.LLM_EMBED_API_KEY ?? '',
  // SDK 默认 10 分钟超时 + 2 次重试,一批 embedding 最坏能等半小时;发帖路径是 fire-and-forget 无所谓,
  // 但 admin 回填接口会撞 Railway 的无数据传输超时(Codex 互审 #6)。单批 ≤ 50 条,30s 足够。
  timeout: 30_000,
  maxRetries: 1,
});

const CHAT_MODEL    = process.env.LLM_CHAT_MODEL    ?? 'deepseek-v4-pro';
const UTILITY_MODEL = process.env.LLM_UTILITY_MODEL ?? 'deepseek-v4-flash';
const EMBED_MODEL   = process.env.LLM_EMBED_MODEL   ?? 'text-embedding-3-small';

// ---------- 通用聊天接口 ----------

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

type ChatOpts = {
  messages: Message[];
  /** 默认 utility model(便宜)。chat 任务显式传 CHAT_MODEL */
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' } | { type: 'text' };
};

export async function llmCall(opts: ChatOpts): Promise<string> {
  const res = await chatClient.chat.completions.create({
    model: opts.model ?? UTILITY_MODEL,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.max_tokens,
    response_format: opts.response_format,
  });
  return res.choices[0]?.message?.content ?? '';
}

/** Chatbot 用,RAG 回答(Phase 3) */
export function chat(opts: Omit<ChatOpts, 'model'> & { model?: string }) {
  return llmCall({ ...opts, model: opts.model ?? CHAT_MODEL });
}

/** Bulk 任务(extract / translate),用便宜的 Flash 模型 */
export function utility(opts: Omit<ChatOpts, 'model'> & { model?: string }) {
  return llmCall({ ...opts, model: opts.model ?? UTILITY_MODEL });
}

// ---------- embedding ----------

/** text-embedding-3-small 的维度;生产 pgvector 列是 vector(1536),换模型必须同步改列 */
export const EMBED_DIM = 1536;

/** 没配 key 时所有 embedding 路径静默降级(发布照常成功,embeddedAt 留空等回填) */
export function isEmbedConfigured(): boolean {
  return Boolean(process.env.LLM_EMBED_API_KEY);
}

/**
 * 批量 embedding:一次 API 调用,按输入顺序返回(OpenAI 返回带 index,不保证顺序)。
 * 调用方负责每批 ≤ 50 条(回填脚本);单条用 embed()。
 */
export async function embedMany(texts: string[], opts: { timeoutMs?: number } = {}): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await embedClient.embeddings.create(
    { model: EMBED_MODEL, input: texts },
    // 回填带整体截止时间时,把剩余预算传进来;不传用客户端默认(30s)。超时后 SDK 不再重试(maxRetries 由剩余预算决定)
    opts.timeoutMs !== undefined ? { timeout: Math.max(1_000, opts.timeoutMs), maxRetries: 0 } : undefined,
  );
  const out: number[][] = new Array(texts.length);
  for (const d of res.data) out[d.index] = d.embedding;
  for (let i = 0; i < texts.length; i++) {
    if (!out[i] || out[i].length !== EMBED_DIM) {
      throw new Error(`embedding #${i} 缺失或维度不对(got ${out[i]?.length ?? 0}, want ${EMBED_DIM})`);
    }
  }
  return out;
}

export async function embed(text: string, opts: { timeoutMs?: number } = {}): Promise<number[]> {
  const [v] = await embedMany([text], opts);
  return v!;
}

// ---------- 高阶 helper:HTML → 结构化 JSON ----------

/**
 * 用 utility model 把任意 HTML 抽成结构化 JSON
 * - 自动加 response_format json_object
 * - 自动 trim HTML 到 50k chars(单源页面通常 < 200k,trim 不影响 events 列表)
 * - 返回解析后的 object,parse 失败抛
 */
export async function extractJSON<T = any>({
  html,
  schemaDescription,
  examples,
  sourceHint,
}: {
  html: string;
  schemaDescription: string;
  examples?: string;
  /** 给 LLM 一个上下文提示(比如"这是 Blacksburg 政府日历页") */
  sourceHint?: string;
}): Promise<T> {
  const systemMsg = [
    'You extract structured event data from HTML pages.',
    sourceHint ? `Context: ${sourceHint}` : '',
    'Output valid JSON only. No markdown code fence. No explanation. Just the JSON object.',
    `Schema: ${schemaDescription}`,
    examples ? `\nExamples:\n${examples}` : '',
  ].filter(Boolean).join('\n');

  const trimmedHtml = html.length > 50000 ? html.slice(0, 50000) : html;

  const raw = await utility({
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: trimmedHtml },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    // DeepSeek max output = 8192;给足以容下 ~30 events 的 JSON
    // 不设的话默认 4096,events 多的源会被截断成 invalid JSON
    max_tokens: 8000,
  });

  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    // 同时显示头尾各 200 字符 — 头部确认是不是 JSON 起手,尾部确认是不是被截断
    const head = raw.slice(0, 200);
    const tail = raw.length > 400 ? raw.slice(-200) : '';
    throw new Error(
      `LLM extract returned invalid JSON (len=${raw.length}). ` +
      `Head: ${head}${tail ? ` ... Tail: ${tail}` : ''}`
    );
  }
}

// ---------- 高阶 helper:英文 → 中文摘要 ----------

/**
 * 把英文事件标题 + 描述翻译成自然中文摘要
 * - 保留店名 / 街道名 / 活动名 / VT 队名等专有名词的英文原文
 * - 输出 ≤ 200 字
 * - 跨多次调用稳定:相同输入 → 高概率相同输出(temperature 0.1)
 */
export async function translateToChineseSummary({
  title,
  description,
  location,
}: {
  title: string;
  description?: string;
  location?: string;
}): Promise<{ titleZh: string; descriptionZh: string }> {
  const userMsg = [
    `标题(原文): ${title}`,
    description ? `描述(原文): ${description.slice(0, 1000)}` : '',
    location ? `地点: ${location}` : '',
  ].filter(Boolean).join('\n');

  const raw = await utility({
    messages: [
      {
        role: 'system',
        content: [
          '你是黑堡本地信息翻译助手。把英文内容翻译成自然中文,服务美国黑堡(Blacksburg, VA)的中国学生 / 华人。',
          '规则:',
          '1. 保留店名 / 街道名 / 活动名 / VT 队名 / 校园建筑名 / 路名等专有名词的英文原文,不要翻译它们',
          '2. titleZh 控制在 25 字以内,简洁直白',
          '3. descriptionZh 控制在 100 字以内,精炼传递关键信息(时间 / 地点 / 是否免费 / 主题)',
          '4. 输出 JSON 格式: {"titleZh": "...", "descriptionZh": "..."}',
        ].join('\n'),
      },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  try {
    const parsed = JSON.parse(raw);
    return {
      titleZh: typeof parsed.titleZh === 'string' ? parsed.titleZh : title,
      descriptionZh: typeof parsed.descriptionZh === 'string' ? parsed.descriptionZh : (description ?? ''),
    };
  } catch {
    return { titleZh: title, descriptionZh: description ?? '' };
  }
}
