// Sprint 7 Phase 1.3:抓取入口
// 在这里注册所有 SourceDefinition,/api/scraper/run 会调用 runAllScrapers(SOURCES)

import type { SourceDefinition } from './types';
import { nextthreedays } from './sources/nextthreedays';
import { stepintoblacksburg } from './sources/stepintoblacksburg';
import { reddit } from './sources/reddit';

// 启用顺序 = 数组顺序。后续加源在这里加 import + 加进数组
export const SOURCES: SourceDefinition[] = [
  nextthreedays,
  stepintoblacksburg,
  reddit,
];

export { runScraper, runAllScrapers } from './runner';
export type { RawEvent, SourceDefinition, SourceCategory, ScrapeResult } from './types';
