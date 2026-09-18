// Sprint 10C:对话接口(第 2 层「继续问」)
//
// POST /api/search/chat   body { site: 'items', message, history: [{role, content}](≤ 6 轮,客户端持有), filters }
// 响应:SSE(text/event-stream)
//   event: summary   data: {"text": "<片段>"}      —— 一句话解释,分片下发
//   event: items     data: {"itemIds": [...], "items": [<与 /api/items 同款脱敏卡片>], "fallback": false | "json" | "contact"}
//   event: done      data: {}
// 进入流之前的拒绝用普通 JSON:404(AI 关)· 403(bot)· 429(配额,带中英提示)· 503(预算熔断 / 配额或计费不可用)· 400(参数)
//
// 流程:9C 配额 → 检索(最近一轮用户消息 + 本次 → embed → 同 10B 的过滤取最近 12 条候选)→ 白名单构造 prompt
//   → **预算原子预留** → DeepSeek chat(关 thinking,max_tokens 300,可取消)→ 结算 → **服务端完整校验后**才下发:
//   JSON 解析失败 / 被截断 → 兜底文案 + 前 3 个候选;itemIds ∩ 候选;summary 过联系方式检测,命中整句换兜底并记日志。
// 偏差(写在 PR 里):不把 LLM 的 token 直接流给用户——未校验的半句话里可能带联系方式。先缓冲(≤ 300 token,约 2 秒)
//   校验,再把通过校验的 summary 分片下发;对用户仍是流式体验,但不变量不靠运气。
// 降级边界(Codex 互审 #7):配额 / 计费不可验证 → 受控 503(不花钱);检索、LLM、卡片查询任一失败 → 兜底文案或空卡片,绝不 500。
// 客户端断开(req.signal)→ 不再发起 / 取消付费调用,停止推送(互审 #9);已发出的调用即使被取消,预留额也保留。
// 对话状态不落库、不关联身份;LLM 没有任何写操作能力(无 tools)。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { setVisitorCookie } from '@/lib/rateLimit';
import { chatWithUsage, CHAT_MODEL_NAME } from '@/lib/llm';
import { isBudgetExceeded, reserveBudget, settleUsage, recordRejection } from '@/lib/llmUsage';
import { buildItemsWhere, parseItemsQuery, resolveSellerContact, serializePublicItem, ITEM_LIST_INCLUDE } from '@/lib/itemsQuery';
import { getVectorStore } from '@/lib/search/vectorStore';
import { isSearchAiEnabled, getQueryEmbeddingCache } from '@/lib/search/hybrid';
import {
  gateChat, sanitizeHistory, sanitizeMessage, retrievalQuery, buildChatMessages, estimatePromptTokens, parseChatOutput, detectLocale,
  CHAT_CANDIDATE_SELECT, CHAT_LIMIT_MESSAGE, NEAREST_FOR_CHAT, FALLBACK_SUMMARY, type ChatCandidate, type ChatGate,
} from '@/lib/search/chat';

export const dynamic = 'force-dynamic';

const CANDIDATE_CAP = 2000;
const CHAT_TIMEOUT_MS = 20_000;
const MAX_COMPLETION_TOKENS = 300;
const ENDPOINT = 'search-chat';

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** summary 分片:按码点切,每片 4 个字,营造打字感(内容已完整校验过) */
function chunks(text: string, size = 4): string[] {
  const cp = [...text];
  const out: string[] = [];
  for (let i = 0; i < cp.length; i += size) out.push(cp.slice(i, i + size).join(''));
  return out;
}

const unavailable = (locale: 'zh' | 'en') =>
  NextResponse.json({ error: locale === 'zh' ? 'AI 助手暂时不可用' : 'AI assistant is temporarily unavailable', budgetExceeded: true }, { status: 503 });

export async function POST(req: NextRequest) {
  if (!isSearchAiEnabled()) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (body?.site !== 'items') return NextResponse.json({ error: 'site 仅支持 items' }, { status: 400 });
  const message = sanitizeMessage(body.message);
  if (!message) return NextResponse.json({ error: '请输入你想找的东西' }, { status: 400 });
  const history = sanitizeHistory(body.history);
  const locale = detectLocale(message);

  // ===== 配额:验证不了就不放行(受控 503,不花钱) =====
  let gate: ChatGate;
  try {
    gate = await gateChat(req);
  } catch (e) {
    console.warn('[search/chat] 配额检查失败,拒绝服务:', (e as Error)?.message ?? e);
    return unavailable(locale);
  }
  if (!gate.ok) {
    if (gate.reason === 'bot') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    recordRejection(ENDPOINT, 429); // 10D:admin 面板与摘要数这个
    const res = NextResponse.json(
      { error: CHAT_LIMIT_MESSAGE[locale], message: CHAT_LIMIT_MESSAGE, retryAfterSec: gate.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSec) } },
    );
    if (gate.isNew && gate.visitorId) setVisitorCookie(res, gate.visitorId);
    return res;
  }

  // 预算前置(只读,fail closed):熔断或计费表不可用时,连查询 embedding 都不花(Codex 互审二轮 #3)。真正的原子扣减在下面的 reserveBudget
  if (await isBudgetExceeded()) { recordRejection(ENDPOINT, 503); return unavailable(locale); }
  if (req.signal.aborted) return new NextResponse(null, { status: 499 });

  // filters 走与列表接口同一个解析器;q 不参与(语义检索用向量)
  const fsp = new URLSearchParams();
  if (body.filters && typeof body.filters === 'object') {
    for (const k of ['type', 'category', 'minPrice', 'maxPrice', 'since', 'sameSellerAs']) {
      const v = (body.filters as Record<string, unknown>)[k];
      if (typeof v === 'string' || typeof v === 'number') fsp.set(k, String(v));
    }
  }
  const qy = parseItemsQuery(fsp);

  // ===== 检索:同 10B 的过滤(不带关键词),最近 12 条。失败 → 无候选,继续(LLM 会如实说没找到) =====
  const candidates: ChatCandidate[] = [];
  try {
    const sellerContact = await resolveSellerContact(qy.sameSellerAs, prisma);
    if (sellerContact !== null) {
      const vector = await getQueryEmbeddingCache().get(retrievalQuery(message, history));
      const pool = await prisma.item.findMany({
        where: buildItemsWhere(qy, { ...(sellerContact !== undefined ? { sellerContact } : {}), includeKeyword: false }),
        select: { id: true },
        take: CANDIDATE_CAP,
      });
      const hits = await getVectorStore().nearest('item', vector, { ids: pool.map(p => p.id) }, NEAREST_FOR_CHAT);
      if (hits.length > 0) {
        const rows = await prisma.item.findMany({ where: { id: { in: hits.map(h => h.id) }, status: 'active' }, select: CHAT_CANDIDATE_SELECT });
        const byId = new Map(rows.map(r => [r.id, r]));
        for (const h of hits) { const r = byId.get(h.id); if (r) candidates.push(r); }
      }
    }
  } catch (e) {
    console.warn('[search/chat] 检索失败,按无候选继续:', (e as Error)?.message ?? e);
  }

  // ===== 付费调用:先原子预留预算,再调,再结算 =====
  let raw = '';
  if (candidates.length > 0 && !req.signal.aborted) {
    const msgs = buildChatMessages({ candidates, history, message });
    const reservation = await reserveBudget({ endpoint: ENDPOINT, model: CHAT_MODEL_NAME, estPromptTokens: estimatePromptTokens(msgs), maxCompletionTokens: MAX_COMPLETION_TOKENS });
    if (!reservation.ok) { recordRejection(ENDPOINT, 503); return unavailable(locale); } // 预算用完,或计费表不可用(fail closed)
    try {
      const out = await chatWithUsage({
        messages: msgs, temperature: 0.2, max_tokens: MAX_COMPLETION_TOKENS,
        response_format: { type: 'json_object' }, timeoutMs: CHAT_TIMEOUT_MS, signal: req.signal,
      });
      await settleUsage(reservation.id, { endpoint: ENDPOINT, model: out.model, promptTokens: out.promptTokens, completionTokens: out.completionTokens });
      // 被 max_tokens 截断的半截 JSON 不当结果(parseChatOutput 对空串走兜底)
      raw = out.truncated ? '' : out.content;
      if (out.truncated) console.warn('[search/chat] LLM 输出被截断,走兜底');
    } catch (e) {
      // 请求已经发出去了:超时 / 取消 / 上游错误都不能证明上游没计费 → 预留额原样保留(宁可多算),绝不撤回(互审二轮 #2)
      console.warn('[search/chat] LLM 调用失败,降级(预留额保留):', (e as Error)?.message ?? e);
    }
  }
  if (req.signal.aborted) return new NextResponse(null, { status: 499 });

  const parsed = parseChatOutput(raw, candidates.map(c => c.id), locale);
  if (parsed.fallback === 'contact') console.warn('[search/chat] summary 命中联系方式检测,已替换为兜底文案');
  if (candidates.length === 0) {
    parsed.summary = locale === 'zh' ? '暂时没找到合适的,换个说法试试?' : 'Nothing suitable yet. Try describing it differently.';
    parsed.itemIds = [];
  }

  // 卡片由数据库渲染(与 /api/items 同款脱敏),顺序按 itemIds。查询失败 → 空卡片,summary 照发
  let items: any[] = [];
  if (parsed.itemIds.length > 0) {
    try {
      const rows = await prisma.item.findMany({ where: { id: { in: parsed.itemIds }, status: 'active' }, include: ITEM_LIST_INCLUDE });
      const byId = new Map(rows.map(r => [r.id, r]));
      items = parsed.itemIds.filter(id => byId.has(id)).map(id => serializePublicItem(byId.get(id)));
    } catch (e) {
      console.warn('[search/chat] 卡片查询失败,返回空卡片:', (e as Error)?.message ?? e);
    }
  }

  const enc = new TextEncoder();
  const signal = req.signal;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const piece of chunks(parsed.summary || FALLBACK_SUMMARY[locale])) {
          if (signal.aborted) break;
          controller.enqueue(enc.encode(sse('summary', { text: piece })));
          await new Promise(r => setTimeout(r, 25));
        }
        if (!signal.aborted) {
          controller.enqueue(enc.encode(sse('items', { itemIds: items.map(i => i.id), items, fallback: parsed.fallback })));
          controller.enqueue(enc.encode(sse('done', {})));
        }
      } catch { /* 客户端已断开,enqueue 抛错:忽略 */ }
      try { controller.close(); } catch { /* 已关闭 */ }
    },
  });
  const res = new NextResponse(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  });
  if (gate.isNew) setVisitorCookie(res, gate.visitorId);
  return res;
}
