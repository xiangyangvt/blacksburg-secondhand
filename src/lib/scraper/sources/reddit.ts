// Source #3: Reddit r/VirginiaTech — 校园讨论(Phase 1.5.2)
//
// 跟其他源不同:这里走 Reddit 的 .json endpoint,不需要 LLM extract。
// 因为 Reddit JSON schema 公开稳定,直接 TypeScript parse 更省钱、更快。
// 只对标题 + selftext 走 translateToChineseSummary(在 runner 里统一做)。
//
// 类目 = discussion(跟活动 / 体育 / 新闻 区分,UI 上不显示「明天 7pm」相对时间,
//   改显「2 小时前」之类发帖时间。但目前 EventCard 用同一个 formatEventTime,
//   通过 publishedAt 字段映射到 startAt 暂时凑合;Phase 1.x 后期再分化 UI)。
//
// 质量门:filter 掉低分 / 无讨论 / NSFW / sticky 通告帖。

import type { SourceDefinition, RawEvent } from '../types';

const SUB = 'VirginiaTech';
// .json 拿 hot(默认排序),limit=25 一次够用
const FEED_URL = `https://www.reddit.com/r/${SUB}/.json?limit=25`;
// Reddit TOS 要求 UA 写清 bot 身份 + 联系方式 - 不写好可能被 429
// 注:必须 ASCII-only,em-dash/中文 character > 255 会被 node fetch 拒绝(ByteString error)
const UA = 'web:com.blacksburg-local:v1.0 (server-to-server bot for blacksburg community info aggregation)';

type RedditPost = {
  id: string;
  title: string;
  selftext: string;
  permalink: string;       // 例:/r/VirginiaTech/comments/abc/title_slug/
  url: string;             // 外链 url(自帖时 = 帖子本身)
  created_utc: number;     // 秒级 unix timestamp
  score: number;
  num_comments: number;
  thumbnail: string;       // "self" / "default" / "nsfw" / "spoiler" / 真 URL
  preview?: {
    images?: Array<{
      source?: { url: string; width: number; height: number };
    }>;
  };
  is_self: boolean;
  over_18: boolean;
  stickied: boolean;
  link_flair_text: string | null;
};

type RedditListing = {
  kind: 'Listing';
  data: {
    children: Array<{ kind: 't3'; data: RedditPost }>;
  };
};

// thumbnail 字段的占位符值
const THUMBNAIL_PLACEHOLDERS = new Set(['self', 'default', 'nsfw', 'spoiler', 'image', '']);

/** 从 Reddit post 抽 imageUrl —— preview.images 优先(高清),fallback 到 thumbnail */
function pickImage(p: RedditPost): string | null {
  // preview.images.source.url 通常是大图,但有 HTML entity 编码
  const previewUrl = p.preview?.images?.[0]?.source?.url;
  if (previewUrl) {
    // Reddit 返回的 URL 把 & 编码成 &amp;,要解码
    return previewUrl.replace(/&amp;/g, '&');
  }
  if (p.thumbnail && !THUMBNAIL_PLACEHOLDERS.has(p.thumbnail)) {
    return p.thumbnail;
  }
  return null;
}

/** 质量门:filter 出值得展示的讨论帖 */
function isQualityPost(p: RedditPost): boolean {
  if (p.over_18) return false;          // NSFW 不展示
  if (p.stickied) return false;          // 版务公告通常没讨论价值
  if (p.score < 5) return false;         // 低分(踩多 / 没看) — 滤掉
  if (p.num_comments < 2) return false;  // 没人讨论的 — 滤掉
  return true;
}

export const reddit: SourceDefinition = {
  id: 'reddit_vt',
  displayName: 'Reddit r/VirginiaTech',
  category: 'discussion',
  // Reddit 公开 API,robots.txt 允许 .json endpoint;每天 1 次 + 标 UA 完全合规
  robotsAllowed: true,

  run: async () => {
    const res = await fetch(FEED_URL, {
      headers: { 'User-Agent': UA },
      cache: 'no-store',
    });
    if (!res.ok) {
      // 429 / 503 给个更清晰的错
      throw new Error(`reddit fetch failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as RedditListing;
    const posts = (json?.data?.children ?? []).map(c => c.data).filter(Boolean);

    const events: RawEvent[] = posts
      .filter(isQualityPost)
      .slice(0, 20) // 跟其他源对齐,上限 20
      .map(p => {
        // permalink → 完整 Reddit URL(打开看原帖 + 评论)
        const sourceUrl = `https://www.reddit.com${p.permalink}`;
        // 描述:selftext(自帖正文)或 link_flair + 评论数提示。截 200 字让 LLM 翻译时不爆
        const flair = p.link_flair_text ? `[${p.link_flair_text}] ` : '';
        // description 用英文(原文/或英文统计) — translateToChineseSummary 是 EN→ZH 流程,
        // 输入混语言会让翻译质量下降。
        const body = p.is_self && p.selftext
          ? p.selftext.slice(0, 200).trim()
          : `${p.num_comments} comments, ${p.score} upvotes`;
        const description = `${flair}${body}`.slice(0, 250);

        return {
          title: p.title,
          sourceUrl,
          sourceId: p.id,
          description,
          // Reddit 帖子是 publish-time,不是 event 的 start-time。
          // 但 schema 复用,所以 publishedAt 用 created_utc,startAt 留 null。
          startAt: undefined,
          endAt: undefined,
          location: 'Reddit r/VirginiaTech',
          imageUrl: pickImage(p) ?? undefined,
          publishedAt: new Date(p.created_utc * 1000).toISOString(),
          qualityScore: Math.min(0.95, 0.6 + Math.log10(Math.max(1, p.score)) * 0.1),
          // qualityScore: 5 分 ≈ 0.67, 50 分 ≈ 0.77, 500 分 ≈ 0.87, 5000 ≈ 0.97 — 平滑
        };
      });

    return events;
  },
};
