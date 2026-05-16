// Source #5: Hokie Sports (hokiesports.com) - VT 校队赛程
// Phase 1.5.4
//
// API endpoint: hokiesports.com/website-api/schedule-events
// 响应不是 JSON:API,是扁平 Laravel-style { data: [...], meta, links }
// 每个 event 对象 include 参数会把 opponent/schedule/sport/logo 嵌套进对象本身
// (不是单独 included 数组)
//
// 反爬:必须像真实 XHR(UA + Accept + x-requested-with + sec-* hints + referer)

import type { SourceDefinition, RawEvent } from '../types';

const BASE_URL = 'https://hokiesports.com/website-api/schedule-events';

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

// ---------- API 响应类型 ----------

type HokieImage = {
  id?: number;
  url?: string;
  alt?: string | null;
};

type HokieSport = {
  id: number;
  name: string;         // "Softball" "Football" 等
  slug: string;         // "softball"
  abbreviation?: string;
};

type HokieSchedule = {
  id: number;
  name?: string;
  sport?: HokieSport | null;
};

type HokieOpponent = {
  id: number;
  name?: string;         // 短名 "South Ala."
  long_name?: string;    // 长名 "University of South Alabama"
  location?: string | null;
  official_logo?: HokieImage | null;
  custom_logo?: HokieImage | null;
};

type HokieEvent = {
  id: number;
  location?: string | null;                   // "Baton Rouge, La."(城市州)
  opponent_id?: number | null;
  opponent?: HokieOpponent | null;
  opponent_name?: string | null;              // 干净版"South Alabama"
  opponent_logo?: HokieImage | null;
  neutral_event?: boolean;
  neutral_event_preposition?: string;         // "vs" / "at"
  datetime?: string;                          // ISO 8601 UTC,有 microseconds
  datetime_end?: string | null;
  is_all_day?: boolean;
  tba?: boolean | null;
  schedule_id?: number | null;
  schedule?: HokieSchedule | null;
  venue?: string | null;                      // "Tiger Park"
  venue_type?: 'home' | 'away' | 'neutral' | string;
  is_conference?: boolean;
  is_exhibition?: boolean;
  status?: string;                            // "scheduled" / "completed" / etc
  hide_from_all_sports_schedule?: boolean;
};

type HokieResponse = {
  data?: HokieEvent[];
  links?: any;
  meta?: any;
};

// ---------- helpers ----------

/** API location 是 "City, State.";只取 city 部分(state 在 EventLocation 模型里冗余) */
function extractCity(loc: string | null | undefined): string {
  if (!loc) return '';
  return loc.split(',')[0]?.trim() ?? '';
}

// ---------- 主逻辑 ----------

export const hokiesports: SourceDefinition = {
  id: 'hokiesports',
  displayName: 'Hokie Sports (VT)',
  category: 'sports',
  robotsAllowed: true,

  run: async () => {
    // 拉 events,sort=datetime 升序(让最近的优先 take per_page)
    // 注:不带 filter[past] — 之前试 past=false 返回 0,API 可能只识别 past=true
    // (Laravel filter 行为不确定,我们在代码里按 datetime > now 过滤未来)
    const includes = [
      'opponent',
      'opponent.officialLogo',
      'opponent.customLogo',
      'opponentLogo',
      'schedule',
      'schedule.sport',
    ].join(',');

    // sort=-datetime(descending)未来比赛永远在 past 比赛之前(datetime 更大)
    // 这样 per_page=80 拉到的都是最近的(包含 upcoming + 刚结束的);
    // 客户端再按 datetime > now 过滤掉 just-completed,剩下 upcoming
    const url =
      `${BASE_URL}` +
      `?filter%5Bsports_hidden_in_schedule_ticker%5D=false` +
      `&per_page=80` +
      `&sort=-datetime` +
      `&include=${encodeURIComponent(includes)}` +
      `&page=1`;

    const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`hokiesports fetch failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as HokieResponse;
    const rows = json.data ?? [];
    if (!Array.isArray(rows)) return [];

    const nowMs = Date.now();
    const events: RawEvent[] = rows
      .filter(e => e.datetime)                                     // 必须有时间
      .filter(e => {
        // 客户端过滤未来 events:datetime > now
        // 给 30 分钟 buffer 让正在进行的比赛仍能显示
        const t = new Date(e.datetime!).getTime();
        return !isNaN(t) && t > nowMs - 30 * 60 * 1000;
      })
      .filter(e => e.status !== 'completed')                       // 双保险
      .filter(e => !e.hide_from_all_sports_schedule)               // 站方隐藏的
      .slice(0, 20)
      .map(e => {
        // 取干净的对手名(opponent_name 已经处理过),fallback 到 opponent 对象
        const opponentName =
          e.opponent_name ||
          e.opponent?.long_name ||
          e.opponent?.name ||
          'TBD';

        // 运动名
        const sportName = e.schedule?.sport?.name ?? 'VT Athletics';
        const sportSlug = e.schedule?.sport?.slug ?? 'athletics';

        // title:主/客/中立 三种表达
        let title: string;
        if (e.venue_type === 'home') {
          title = `VT ${sportName} vs ${opponentName}`;
        } else if (e.venue_type === 'away') {
          title = `VT ${sportName} at ${opponentName}`;
        } else {
          // neutral — 用 API 给的 preposition(通常是 "vs")
          const prep = e.neutral_event_preposition || 'vs';
          title = `VT ${sportName} ${prep} ${opponentName}`;
        }

        // location 拼成 "Venue, City" 让 parseLocation 能切出 city
        // home: "Lane Stadium, Blacksburg" / away: "Tiger Park, Baton Rouge"
        const city =
          e.venue_type === 'home'
            ? 'Blacksburg'
            : extractCity(e.location) || extractCity(e.opponent?.location ?? null) || 'TBD';
        const venue = e.venue || (e.venue_type === 'home' ? 'Virginia Tech' : opponentName);
        const location = `${venue}, ${city}`.slice(0, 80);

        // 对手 logo(opponent_logo 是顶级字段,opponent.official_logo 是嵌套 fallback)
        const imageUrl =
          e.opponent_logo?.url ||
          e.opponent?.official_logo?.url ||
          e.opponent?.custom_logo?.url ||
          undefined;

        // sourceUrl:hokiesports 没暴露 event 详情页,跳 sport 的 schedule 总览
        const sourceUrl = `https://hokiesports.com/sports/${sportSlug}/schedule`;

        // description 简洁:运动 + ACC/exhibition tag
        const tags: string[] = [];
        if (e.is_conference) tags.push('ACC');
        if (e.is_exhibition) tags.push('热身赛');
        const description =
          tags.length > 0
            ? `Virginia Tech ${sportName} (${tags.join(' · ')})`
            : `Virginia Tech ${sportName}`;

        return {
          title: title.slice(0, 100),
          sourceUrl,
          sourceId: String(e.id),
          description,
          startAt: e.datetime,
          endAt: e.datetime_end ?? undefined,
          location,
          imageUrl,
          qualityScore: 0.9, // VT 体育赛事质量稳定,不需 LLM 判
        };
      });

    return events;
  },
};
