// Sprint 7 Phase 1.3:抓取系统通用类型

export type SourceCategory = 'events' | 'sports' | 'news' | 'discussion';

/** LLM extract 或 API 返回的原始 event(英文,未翻译) */
export type RawEvent = {
  /** 源站自带的 id(可空,fallback 用 URL slug) */
  sourceId?: string;
  /** 必填:这条 event 在源站的 URL */
  sourceUrl: string;
  /** 必填:英文原始标题 */
  title: string;
  /** 英文描述(取一两句话,不要全文) */
  description?: string;
  /** ISO 8601 */
  startAt?: string;
  endAt?: string;
  location?: string;
  imageUrl?: string;
  /** LLM 自评 0-1,< 0.5 会被丢弃 */
  qualityScore?: number;
  /** 源站标的发布时间(ISO) */
  publishedAt?: string;
};

export type SourceDefinition = {
  /** 唯一标识,存到 Event.source */
  id: string;
  /** 给 UI 显示的名字(比如"NextThreeDays") */
  displayName: string;
  /** 显示分类 */
  category: SourceCategory;
  /** robots.txt 是否允许;开发时手动设(每个源先扫一遍 robots) */
  robotsAllowed: boolean;
  /** 实际跑抓取:fetch + parse,返回 RawEvent[] */
  run: () => Promise<RawEvent[]>;
};

export type ScrapeResult = {
  source: string;
  status: 'success' | 'failed' | 'skipped';
  itemsFound: number;
  itemsNew: number;
  errorMsg?: string;
};
