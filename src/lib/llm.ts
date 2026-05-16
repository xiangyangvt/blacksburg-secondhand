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

export async function embed(text: string): Promise<number[]> {
  const res = await embedClient.embeddings.create({
    model: EMBED_MODEL,
    input: text,
  });
  return res.data[0]!.embedding;
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
  });

  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`LLM extract returned invalid JSON: ${raw.slice(0, 200)}...`);
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
