// Reddit RSS 抓取共用 helper(Phase 2B)
// 多个 sub(r/VirginiaTech、r/NewRiverValley 等)复用相同 Atom 解析逻辑

import type { SourceDefinition, RawEvent, SourceCategory } from '../types';

const UA = 'Mozilla/5.0 (compatible; BlacksburgLocalBot/1.0; community info aggregator)';

type RedditRssPost = {
  id: string;
  title: string;
  content: string;
  author: string;
  permalink: string;
  publishedAt: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function htmlToPlain(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

function parseFeed(xml: string): RedditRssPost[] {
  const posts: RedditRssPost[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null) {
    const body = m[1];
    const id = body.match(/<id>(?:tag:reddit\.com,\d+:)?([^<]+)<\/id>/)?.[1]?.trim() ?? '';
    const title = decodeEntities(body.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '');
    const link = body.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '';
    const author = body.match(/<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/)?.[1]?.trim() ?? '';
    const publishedAt = body.match(/<published>([^<]+)<\/published>/)?.[1]?.trim() ?? '';
    const contentRaw = body.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? '';
    const content = htmlToPlain(contentRaw);
    if (id && title && link) {
      posts.push({ id, title, content, author, permalink: link, publishedAt });
    }
  }
  return posts;
}

function isQualityPost(p: RedditRssPost): boolean {
  if (p.title.length < 10) return false;
  if (/^\[?(removed|deleted|automod|mod post|weekly)/i.test(p.title)) return false;
  return true;
}

/**
 * Reddit subreddit RSS source 工厂
 * 同一套 RSS 解析逻辑,只需给 sub + 文案
 */
export function createRedditSource(config: {
  id: string;                  // 'reddit_vt' / 'reddit_nrv' 等
  sub: string;                 // 'VirginiaTech' / 'NewRiverValley'
  displayName: string;         // 'Reddit r/VirginiaTech'
  category: SourceCategory;    // 默认 'discussion'
  locationLabel: string;       // 卡片 location 字段值
  fallbackDesc: string;        // content 为空时的默认描述
}): SourceDefinition {
  const feedUrl = `https://www.reddit.com/r/${config.sub}.rss`;
  return {
    id: config.id,
    displayName: config.displayName,
    category: config.category,
    robotsAllowed: true,

    run: async () => {
      const res = await fetch(feedUrl, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`reddit RSS ${config.sub} fetch failed: ${res.status} ${res.statusText}`);
      }
      const xml = await res.text();
      const posts = parseFeed(xml);

      const events: RawEvent[] = posts
        .filter(isQualityPost)
        .slice(0, 20)
        .map(p => ({
          title: p.title.slice(0, 100),
          sourceUrl: p.permalink,
          sourceId: p.id,
          description: p.content ? p.content.slice(0, 200) : config.fallbackDesc,
          startAt: undefined,
          endAt: undefined,
          location: config.locationLabel,
          imageUrl: undefined,
          publishedAt: p.publishedAt || undefined,
          qualityScore: 0.75,
        }));

      return events;
    },
  };
}
