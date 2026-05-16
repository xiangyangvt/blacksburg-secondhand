// Source #3: Reddit r/VirginiaTech — 校园讨论(Phase 1.5.2)
//
// 抓取策略:走 Reddit 公开 RSS feed,不需要 OAuth/API key/login。
// Reddit 对 .json endpoint 会主动 block 数据中心 IP(Railway 等),
// 但 RSS 是给搜索引擎和 RSS reader 用的,他们不会卡这个。
//
// 损失字段:RSS 没有 score / num_comments / preview image,只有 title + author
//   + content (HTML) + permalink + published 时间。对"讨论"内容流够用。
// 旧的 OAuth/JSON 实现代码 git history 里能找到,以后如果 Reddit 也封 RSS 再换。
//
// 类目 = discussion(UI 上 startAt 留空,卡片只显标题 + 描述 + "Reddit r/X" 标识)

import type { SourceDefinition, RawEvent } from '../types';

const SUB = 'VirginiaTech';
// /r/X.rss 默认 hot 排序,跟 .json 默认一致
const FEED_URL = `https://www.reddit.com/r/${SUB}.rss`;
// UA 必须 ASCII-only;Reddit RSS 对 UA 不严格,但带 bot 身份合规
const UA = 'Mozilla/5.0 (compatible; BlacksburgLocalBot/1.0; community info aggregator)';

// ---------- 简易 Atom/RSS 解析(正则) ----------
// Reddit 用 Atom 1.0(<feed>+<entry>),不是经典 RSS
// 字段结构:
//   <entry>
//     <author><name>/u/xxx</name></author>
//     <content type="html">...escaped HTML body...</content>
//     <id>tag:reddit.com,2008:t3_xxxxxx</id>
//     <link href="https://www.reddit.com/r/X/comments/xxx/slug/" />
//     <updated>ISO</updated>
//     <published>ISO</published>
//     <title>Post title</title>
//   </entry>

type RedditRssPost = {
  id: string;            // t3_xxx
  title: string;
  content: string;       // already HTML-decoded + tags stripped
  author: string;
  permalink: string;
  publishedAt: string;
};

/** HTML entity decode(只处理 RSS 常见几个) */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&'); // 必须最后,否则 &amp;lt; 会被先 decode 成 &lt; 再变 <
}

/** 把 <p>x</p><br/>y 之类的转纯文本 */
function htmlToPlain(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function parseFeed(xml: string): RedditRssPost[] {
  const posts: RedditRssPost[] = [];
  // 抓所有 <entry>...</entry> 块
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

/** 内容质量门 — RSS 没 score,只能靠 title / content 长度 + 黑名单 */
function isQualityPost(p: RedditRssPost): boolean {
  // 太短的(纯 emoji / 一行问候)跳过
  if (p.title.length < 10) return false;
  // automod / removal 通知不要
  if (/^\[?(removed|deleted|automod|mod post|weekly)/i.test(p.title)) return false;
  return true;
}

export const reddit: SourceDefinition = {
  id: 'reddit_vt',
  displayName: 'Reddit r/VirginiaTech',
  category: 'discussion',
  robotsAllowed: true, // RSS 是公开广播 feed

  run: async () => {
    const res = await fetch(FEED_URL, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`reddit RSS fetch failed: ${res.status} ${res.statusText}`);
    }
    const xml = await res.text();
    const posts = parseFeed(xml);

    const events: RawEvent[] = posts
      .filter(isQualityPost)
      .slice(0, 20)
      .map(p => {
        const description = p.content
          ? p.content.slice(0, 200)
          : `Discussion on r/VirginiaTech`; // RSS 偶尔 content 为空(link post),给个 fallback

        return {
          title: p.title.slice(0, 100),
          sourceUrl: p.permalink,
          sourceId: p.id,
          description,
          // Reddit 帖子无 event 概念;startAt 留空,只用 publishedAt(发帖时间)
          startAt: undefined,
          endAt: undefined,
          location: 'Reddit r/VirginiaTech',
          imageUrl: undefined, // RSS 不含缩略图
          publishedAt: p.publishedAt || undefined,
          // qualityScore 缺 score 信号,固定中等偏上,留给 LLM 翻译 + 用户行为修正
          qualityScore: 0.75,
        };
      });

    return events;
  },
};
