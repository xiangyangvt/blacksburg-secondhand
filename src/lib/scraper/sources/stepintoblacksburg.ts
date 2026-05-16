// Source #2: StepIntoBlacksburg — Blacksburg Partnership(下游商家协会)活动列表
// Phase 1.5.1
//
// 抓取策略:HTML page → DeepSeek V4 Flash extract → RawEvent[]
// 这个站是 WordPress + Tribe Events plugin,结构干净,events 数量少(~2-10)。
// 列表页和详情页都有真实活动配图(Jetpack CDN i0.wp.com),og:image 有效。

import type { SourceDefinition, RawEvent } from '../types';
import { extractJSON } from '@/lib/llm';
import { enrichImagesFromDetailPages } from '../ogImage';

const LIST_URL = 'https://stepintoblacksburg.org/events/list/?hide_subsequent_recurrences=1';
const UA = 'Mozilla/5.0 (compatible; BlacksburgLocalBot/1.0; +https://blacksburg-secondhand-production.up.railway.app)';

export const stepintoblacksburg: SourceDefinition = {
  id: 'stepintoblacksburg',
  displayName: 'StepIntoBlacksburg',
  category: 'events',
  robotsAllowed: true, // 公开商家协会站,无 robots 禁止;每天 1 次抓取 + 注明 UA

  run: async () => {
    const res = await fetch(LIST_URL, {
      headers: { 'User-Agent': UA },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`fetch ${LIST_URL} → ${res.status} ${res.statusText}`);
    }
    const html = await res.text();

    const result = await extractJSON<{ events: RawEvent[] }>({
      html,
      sourceHint:
        'This is StepIntoBlacksburg.org events list — a community/business association in Blacksburg, VA. Powered by WordPress + Tribe Events plugin. Each event has image, title, date with EDT timezone, venue address, and short blurb. Events are mostly in Blacksburg/Christiansburg area, focus on festivals, food/drink, community events.',
      schemaDescription: `{
  "events": Array<{
    "title": string,           // Event name (English original, max 100 chars)
    "sourceUrl": string,       // Full URL to event detail page (absolute starting with https://)
    "description"?: string,    // ONE sentence summary, max 150 chars
    "startAt"?: string,        // ISO 8601 with EDT offset, e.g. "2026-06-06T13:00:00-04:00"
    "endAt"?: string,
    "location"?: string,       // "Venue, City" format, e.g. "Historic Smithfield, Blacksburg"
    "imageUrl"?: string,       // Image URL from page (Jetpack CDN i0.wp.com is common here)
    "qualityScore"?: number    // 0-1, default 0.85
  }>
}`,
      examples: `Example output:
{"events":[{"title":"16th Blacksburg Fork and Cork","sourceUrl":"https://stepintoblacksburg.org/event/16th-blacksburg-fork-and-cork/","description":"Community festival featuring Virginia wines, regional food, vendors and live music.","startAt":"2026-06-06T13:00:00-04:00","endAt":"2026-06-06T17:30:00-04:00","location":"Historic Smithfield, Blacksburg","imageUrl":"https://i0.wp.com/stepintoblacksburg.org/wp-content/uploads/2026/05/Blacksburg-Facebook-Cover-F-and-C-resched-2026-1.png","qualityScore":0.9}]}

CRITICAL output budget rules:
- Extract AT MOST 20 events. Site usually has < 10 active, so all of them fits comfortably.
- description ≤ 150 chars, ONE sentence.
- Keep titles ≤ 100 chars.

IMAGE RULES:
- Each event card has an <img> at i0.wp.com/.../wp-content/uploads/... — copy that URL verbatim.
- Skip the site logo (logo.svg) and category icons.
- If sourceUrl is relative, prefix with https://stepintoblacksburg.org.

TIME RULES:
- Blacksburg = Eastern Time. EDT = -04:00 (Mar-Nov), EST = -05:00 (Nov-Mar).
- Site shows times like "June 6 @ 1:00 PM - 5:30 PM EDT" — parse year from context (currently 2026 unless event explicitly says otherwise).
- If only date is shown (no time), OMIT startAt rather than guessing.

OTHER:
- "Location: Online / Zoom" → location = "Online (Zoom)"  (don't pretend it's a physical place)
- Skip "Submit Your Own Event" navigation, filters, and previous-events links — those aren't events.
- "Featured" badge before date → still extract normally, don't bias quality.
- qualityScore: 0.85 default, +0.05 if "Featured" badge.`,
    });

    const events = Array.isArray(result?.events) ? result.events : [];

    // 详情页 og:image enrichment — 列表页已经有图,但有些 event 可能 LLM 漏抓;
    // 详情页一般是同一张图或更高清的版本。失败 fail silent。
    await enrichImagesFromDetailPages(events);

    return events;
  },
};
