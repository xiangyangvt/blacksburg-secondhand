// Source #5: Hokie Sports (hokiesports.com) - VT 校队赛程
// Phase 1.5.4
//
// 抓取策略:hokiesports 是 WMT Digital 做的,前端 SPA 调一个 JSON:API 风格的
// /website-api/schedule-events 端点。endpoint 是 Sean 在 DevTools 抓的真实请求。
//
// JSON:API 响应结构:
//   { data: [ScheduleEvent], included: [Team, Sport, Image, ...] }
//   每个 ScheduleEvent 通过 relationships 引用 included 数组里的相关资源
//
// 反爬:必须像真实 XHR 调用 — UA + Accept + x-requested-with + referer + sec-* hints
// (光改 UA 不够,Sean 抓的 curl 里这些 headers 都是必要的)

import type { SourceDefinition, RawEvent } from '../types';

const BASE_URL = 'https://hokiesports.com/website-api/schedule-events';

// 真实浏览器 headers(从 Sean DevTools 抓的 curl 摘出来) — x-requested-with + referer + sec-* hints
// 缺任何一项可能被识别成 bot
const HEADERS: Record<string, string> = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
  referer: 'https://hokiesports.com/',
  'sec-ch-ua': '"Chromium";v="148", "Not/A)Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
};

// ---------- JSON:API 类型 ----------

type ResourceRef = { id: string; type: string };
type ResourceLink = { data?: ResourceRef | ResourceRef[] | null };

type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, any>;
  relationships?: Record<string, ResourceLink>;
};

type JsonApiResponse = {
  data?: JsonApiResource[];
  included?: JsonApiResource[];
};

/** id+type 在 included 数组里查找(O(N) 简单 lookup,数据量小) */
function resolve(
  included: JsonApiResource[] | undefined,
  ref: ResourceRef | null | undefined,
): JsonApiResource | null {
  if (!included || !ref) return null;
  return included.find(r => r.id === ref.id && r.type === ref.type) ?? null;
}

/** 提取 relationship 的单个引用(忽略数组) */
function singleRef(rel: ResourceLink | undefined): ResourceRef | null {
  const d = rel?.data;
  if (!d || Array.isArray(d)) return null;
  return d;
}

// ---------- 主逻辑 ----------

export const hokiesports: SourceDefinition = {
  id: 'hokiesports',
  displayName: 'Hokie Sports (VT)',
  category: 'sports',
  robotsAllowed: true, // 公开赛程网页 + 端点,不抓 personal data

  run: async () => {
    // upcoming events,按时间升序,30 条
    // include 用 dotted path 把 opponent + opponent 的 logo + schedule 的 sport 一次拉全
    const includes = [
      'opponent',
      'opponent.officialLogo',
      'opponent.customLogo',
      'opponentLogo',
      'schedule',
      'schedule.sport',
    ].join(',');

    const url =
      `${BASE_URL}` +
      `?filter%5Bsports_hidden_in_schedule_ticker%5D=false` +
      `&filter%5Bpast%5D=false` +
      `&filter%5Bneutral_event%5D=false` +
      `&per_page=30` +
      `&sort=datetime` +
      `&include=${encodeURIComponent(includes)}` +
      `&page=1`;

    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`hokiesports fetch failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as JsonApiResponse;
    const rows = json.data ?? [];
    const included = json.included ?? [];

    if (!Array.isArray(rows)) return [];

    const events: RawEvent[] = rows
      .filter(e => e.attributes?.datetime || e.attributes?.start_at || e.attributes?.startsOn)
      .slice(0, 20)
      .map(e => {
        const a = e.attributes ?? {};

        // 关联 lookup
        const opponent = resolve(included, singleRef(e.relationships?.opponent));
        const opponentLogo =
          resolve(included, singleRef(e.relationships?.opponentLogo)) ||
          resolve(included, singleRef(opponent?.relationships?.officialLogo)) ||
          resolve(included, singleRef(opponent?.relationships?.customLogo));
        const schedule = resolve(included, singleRef(e.relationships?.schedule));
        const sport = resolve(included, singleRef(schedule?.relationships?.sport));

        const sportName: string =
          sport?.attributes?.name ??
          schedule?.attributes?.name ??
          'VT Athletics';
        const opponentName: string =
          opponent?.attributes?.name ??
          opponent?.attributes?.display_name ??
          'TBD';

        // 主客场判断 — 字段名 hokiesports 可能用 is_home / home / is_home_event
        const isHome = Boolean(a.is_home || a.is_home_event || a.home);
        const vsText = isHome ? 'vs' : 'at';
        const title = `VT ${sportName} ${vsText} ${opponentName}`.slice(0, 100);

        // 地点:主场默认 Blacksburg,客场用 a.location
        const venue: string =
          a.location ||
          a.venue ||
          a.facility_name ||
          (isHome ? 'Virginia Tech' : opponentName);
        const location = `${venue}, ${isHome ? 'Blacksburg' : (opponent?.attributes?.city ?? 'TBD')}`;

        // imageUrl — opponent logo URL 字段可能是 url / src / image_url
        const logoUrl: string | undefined =
          opponentLogo?.attributes?.url ||
          opponentLogo?.attributes?.src ||
          opponentLogo?.attributes?.image_url ||
          undefined;

        // sourceUrl — hokiesports 没暴露 event 详情页,fallback 到 schedule 主页
        const sportSlug = sport?.attributes?.slug || sport?.attributes?.short_name?.toLowerCase() || 'athletics';
        const sourceUrl = `https://hokiesports.com/sports/${sportSlug}/schedule`;

        // 描述:简洁说明赛事性质(season type / TV / ticket info)
        const seasonType = a.season_type || a.event_type || '';
        const tvNetwork = a.tv_network || '';
        const descParts = [seasonType, tvNetwork ? `TV: ${tvNetwork}` : '']
          .filter(Boolean)
          .join(' · ');

        return {
          title,
          sourceUrl,
          sourceId: e.id,
          description: descParts || `Virginia Tech ${sportName}`,
          startAt: a.datetime || a.start_at || a.startsOn,
          endAt: undefined,
          location,
          imageUrl: logoUrl,
          qualityScore: 0.9, // VT 体育赛事质量都很高,不需 LLM 判断
        };
      });

    return events;
  },
};
