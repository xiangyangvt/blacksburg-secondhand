// Reddit 子版块抓取 sources(Phase 1.5.2 + Phase 2B)
//
// 共用工厂 createRedditSource 在 _reddit_common.ts;
// 这里只列每个子版块的配置。
//
// 抓取策略:走 Reddit 公开 RSS feed,不需要 OAuth/API key/login。
// Reddit 对 .json endpoint 会主动 block 数据中心 IP(Railway 等),
// 但 RSS 是给搜索引擎和 RSS reader 用的,他们不会卡这个。

import { createRedditSource } from './_reddit_common';

/** Source #3: r/VirginiaTech — 校园讨论 */
export const reddit = createRedditSource({
  id: 'reddit_vt',
  sub: 'VirginiaTech',
  displayName: 'Reddit r/VirginiaTech',
  category: 'discussion',
  locationLabel: 'Reddit r/VirginiaTech',
  fallbackDesc: 'Discussion on r/VirginiaTech',
});

/** Source #6 (Phase 2B): r/NewRiverValley — 户外/钓鱼/匹克球等本地兴趣讨论 */
export const redditNrv = createRedditSource({
  id: 'reddit_nrv',
  sub: 'NewRiverValley',
  displayName: 'Reddit r/NewRiverValley',
  category: 'discussion',
  locationLabel: 'Reddit r/NewRiverValley',
  fallbackDesc: 'Discussion on r/NewRiverValley',
});
