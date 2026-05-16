// Source #4: GobblerConnect (vt.campuslabs.com/engage) - VT 学生组织活动
// Phase 1.5.3
//
// VT 跑在 Campus Labs Engage 平台上。前端 SPA 调一个公开的 discovery API
// 拉 events JSON,我们直接命中这个 API,不用 puppeteer。
// (官方 v3 API 需要 admin key,但 discovery 公开 — 浏览器没登录也能浏览 events)
//
// API endpoint(Sean 在 DevTools Network 里确认):
//   GET /engage/api/discovery/event/search?endsAfter=<ISO>&orderByField=endsOn&orderByDirection=ascending&take=20
//
// 注:Campus Labs API 全 ASCII 严格 — UA / headers 不能含 unicode

import type { SourceDefinition, RawEvent } from '../types';

const BASE = 'https://vt.campuslabs.com/engage/api/discovery/event/search';
const UA = 'Mozilla/5.0 (compatible; BlacksburgLocalBot/1.0; +https://blacksburg-secondhand-production.up.railway.app)';

// Campus Labs Engage discovery API response shape(根据社区已知 schema + Sean DevTools 看到的字段)
type EngageEvent = {
  id: number | string;
  name: string;                    // event title
  description?: string | null;     // raw HTML 或 plain text
  startsOn: string;                // ISO 8601 with timezone
  endsOn?: string | null;
  location?: string | null;
  imagePath?: string | null;       // 通常是相对路径,需要拼 CDN
  organizationName?: string | null;
  status?: string;                 // "Approved" 等
  categoryNames?: string[];
  theme?: string | null;
};

type EngageResponse = {
  '@odata.count'?: number;
  value?: EngageEvent[];
  // 不同版本字段名可能是 items / events,做兼容
  items?: EngageEvent[];
  events?: EngageEvent[];
};

/** 去 HTML 标签 + collapse 空白(描述可能含 <p> <br>) */
function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** imagePath 转绝对 URL(Engage 把 image 存在自己 CDN) */
function resolveImage(p: string | null | undefined): string | undefined {
  if (!p) return undefined;
  if (p.startsWith('http')) return p;
  // Engage image CDN 常见路径:大写驼峰路径直接拼到 se-images.campuslabs.com
  if (p.startsWith('/')) return `https://se-images.campuslabs.com${p}`;
  return `https://se-images.campuslabs.com/clink/images/${p}`;
}

export const gobblerconnect: SourceDefinition = {
  id: 'gobblerconnect',
  displayName: 'GobblerConnect (VT)',
  category: 'events',
  robotsAllowed: true, // 公开 discovery API,网页本身不登录也能浏览

  run: async () => {
    // 拉未来 90 天内已开始或还没结束的 events,upcoming 优先排序
    const now = new Date();
    const endsAfter = encodeURIComponent(now.toISOString());

    const url = `${BASE}?endsAfter=${endsAfter}&orderByField=endsOn&orderByDirection=ascending&take=40&status=Approved`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`engage api: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as EngageResponse;
    // 兼容 value / items / events 三种 wrapper
    const raw = json.value ?? json.items ?? json.events ?? [];
    if (!Array.isArray(raw)) return [];

    const events: RawEvent[] = raw
      .filter(e => e && e.name && e.startsOn)
      // status filter — 跳掉草稿 / 取消的
      .filter(e => !e.status || /approved|public/i.test(e.status))
      .slice(0, 20)
      .map(e => {
        // sourceUrl:拼回 Engage 详情页(用户能点开看活动详情)
        const sourceUrl = `https://vt.campuslabs.com/engage/event/${e.id}`;
        const description = stripHtml(e.description).slice(0, 200);
        // location:可能 plain string 或带 venue 描述
        const location = e.location ? e.location.trim() + ', Blacksburg' : 'Virginia Tech, Blacksburg';

        return {
          title: e.name.trim().slice(0, 100),
          sourceUrl,
          sourceId: String(e.id),
          description,
          startAt: e.startsOn,
          endAt: e.endsOn ?? undefined,
          location,
          imageUrl: resolveImage(e.imagePath),
          // qualityScore:有 image / 有 description / 长 title 综合
          qualityScore:
            (e.imagePath ? 0.05 : 0) +
            (description.length > 50 ? 0.05 : 0) +
            0.8,
        };
      });

    return events;
  },
};
