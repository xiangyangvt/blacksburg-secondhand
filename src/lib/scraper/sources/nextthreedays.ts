// Source #1: NextThreeDays.com — NRV(New River Valley)总事件聚合
// Sean 最早提的源,作为 Phase 1.4 POC
//
// 抓取策略:HTML page → DeepSeek V4 Flash extract → RawEvent[]
// User-Agent 注明 bot 身份,降低被封风险
// 频率:每天 1 次(GitHub Action cron 7 AM EST)

import type { SourceDefinition, RawEvent } from '../types';
import { extractJSON } from '@/lib/llm';

const FEATURED_URL = 'https://www.nextthreedays.com/FeaturedEvents.cfm';
const UA = 'Mozilla/5.0 (compatible; BlacksburgLocalBot/1.0; +https://blacksburg-secondhand-production.up.railway.app)';

export const nextthreedays: SourceDefinition = {
  id: 'nextthreedays',
  displayName: 'NextThreeDays',
  category: 'life',
  robotsAllowed: true, // 公开 events 聚合站,无 robots 禁止;我们每天 1 次抓取,User-Agent 注明

  run: async () => {
    const res = await fetch(FEATURED_URL, {
      headers: { 'User-Agent': UA },
      // 缓存控制:每次 cron 拉最新
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`fetch ${FEATURED_URL} → ${res.status} ${res.statusText}`);
    }
    const html = await res.text();

    // LLM extract:把 HTML 里看到的 events 一次性提成 JSON
    // ⚠️ Output budget:DeepSeek max_tokens=8192,~24K chars JSON;
    //   每 event ~600 字符(含 description) → 安全容量 ~25 events。
    //   超过会被截断成 invalid JSON。所以 prompt 里明确限 20 + 短描述。
    const result = await extractJSON<{ events: RawEvent[] }>({
      html,
      sourceHint:
        'This is NextThreeDays.com FeaturedEvents page — a local events aggregator for the New River Valley including Blacksburg, Christiansburg, Floyd, Giles, Pulaski, Radford. Extract individual upcoming events visible on the page.',
      schemaDescription: `{
  "events": Array<{
    "title": string,           // Event name (English original, max 100 chars)
    "sourceUrl": string,       // Full URL to the event detail page (absolute, must start with https://)
    "description"?: string,    // ONE sentence summary, max 150 chars. Keep it terse.
    "startAt"?: string,        // ISO 8601 in local time WITH -04:00 offset (Blacksburg = EDT summer / EST winter). DO NOT guess if unknown — leave null.
    "endAt"?: string,          // ISO 8601 same rules
    "location"?: string,       // Venue + city, max 80 chars, e.g. "Champs Sports Grille, Blacksburg"
    "imageUrl"?: string,       // REQUIRED if visible. Full absolute URL to thumbnail <img> near event title. Look for <img src="...">.
    "qualityScore"?: number    // 0-1, your judgment of whether this looks like a real local event vs noise (default 0.8)
  }>
}`,
      examples: `Example output:
{"events":[{"title":"Trivia Night at Champs","sourceUrl":"https://www.nextthreedays.com/EventDetails.cfm?ID=12345","description":"Weekly trivia with prizes.","startAt":"2026-05-21T19:00:00-04:00","location":"Champs Sports Grille, Blacksburg","imageUrl":"https://www.nextthreedays.com/images/12345.jpg","qualityScore":0.85}]}

CRITICAL output budget rules (output will be truncated if too long):
- Extract AT MOST 20 events. If page has more, pick the 20 most upcoming/highest-quality.
- description MUST be ≤ 150 chars. ONE sentence only. No marketing fluff.
- Keep titles ≤ 100 chars. Strip "Featured Event:" / venue prefixes if redundant with location.

IMAGE RULES (current data has 0% image coverage — FIX THIS):
- Each event card on nextthreedays.com has a thumbnail. Find the <img> tag near the event title or detail link and copy its src into imageUrl.
- If src is relative (starts with /), prefix https://www.nextthreedays.com.
- If you see no image for an event, OMIT the field — don't make one up.
- Common image hosts: nextthreedays.com itself, or upload subdomain. Either is fine.

TIME RULES (don't fabricate timestamps):
- Blacksburg is Eastern Time. Use offset -04:00 (EDT, March-Nov) or -05:00 (EST, Nov-March).
- If event has only a date but no time, set startAt to that date at NOON local: "2026-05-21T12:00:00-04:00" is WRONG if real time is unknown — instead, OMIT startAt entirely. Leaving it null is better than guessing.
- If multiple events share the same listed start time on the page (e.g., "All Day"), use the time literally shown on the page — do NOT batch-assign 12:00.

Other rules:
- Only extract events explicitly listed on this page. Don't invent.
- If sourceUrl is relative, make it absolute by prefixing https://www.nextthreedays.com.
- Skip ads, navigation, "see more" links.
- qualityScore: 0.85 default for real events, lower if title is generic ("Event"), higher if has location + time.`,
    });

    // 已确认:nextthreedays 列表页和详情页都没有 per-event 图片。
    // og:image 全是网站 logo(n3dlogo.png),所以不在这里调用 enrichImagesFromDetailPages
    // (会被 looksGeneric 过滤掉,纯浪费时间)。
    // /localnews 用类目色 + Calendar icon 占位作为视觉兜底。
    return Array.isArray(result?.events) ? result.events : [];
  },
};
