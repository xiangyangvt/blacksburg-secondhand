// Sprint 7 Phase 1.3:抓取入口
// 在这里注册所有 SourceDefinition,/api/scraper/run 会调用 runAllScrapers(SOURCES)
//
// Phase 3B: 砍 Reddit(r/VirginiaTech 和 r/NewRiverValley)。这两个源的内容
// 在 Event 通用化语境下不再合适 — 站点定位是"组活动凑人 + 求助互助",Reddit
// 讨论帖噪音大、跟"live"诉求错位。砍源 + 数据 hard delete 走
// /api/admin/cleanup-reddit。

import type { SourceDefinition } from './types';
import { nextthreedays } from './sources/nextthreedays';
import { stepintoblacksburg } from './sources/stepintoblacksburg';
import { gobblerconnect } from './sources/gobblerconnect';
import { hokiesports } from './sources/hokiesports';

// 启用顺序 = 数组顺序。后续加源在这里加 import + 加进数组
export const SOURCES: SourceDefinition[] = [
  nextthreedays,
  stepintoblacksburg,
  gobblerconnect,
  hokiesports,
];

export { runScraper, runAllScrapers } from './runner';
export type { RawEvent, SourceDefinition, SourceCategory, ScrapeResult } from './types';
