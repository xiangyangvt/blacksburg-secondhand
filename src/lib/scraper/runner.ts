// Sprint 7 Phase 1.3:抓取流程编排
// 一次跑一个源:fetch → parse → 翻译 → dedup → DB write
// 失败不抛,记 ScrapeRun.errorMsg,继续下一个源

import { prisma } from '@/lib/prisma';
import { translateToChineseSummary } from '@/lib/llm';
import type { SourceDefinition, RawEvent, ScrapeResult } from './types';

export async function runScraper(def: SourceDefinition): Promise<ScrapeResult> {
  if (!def.robotsAllowed) {
    return {
      source: def.id,
      status: 'skipped',
      itemsFound: 0,
      itemsNew: 0,
      errorMsg: 'robots.txt 禁止抓取',
    };
  }

  // 开始日志
  const run = await prisma.scrapeRun.create({
    data: { source: def.id, status: 'running' },
  });

  // 抓数据(可能抛)
  let rawEvents: RawEvent[] = [];
  try {
    rawEvents = await def.run();
  } catch (e: any) {
    const errorMsg = String(e?.message ?? e).slice(0, 500);
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: { status: 'failed', finishedAt: new Date(), errorMsg },
    });
    return { source: def.id, status: 'failed', itemsFound: 0, itemsNew: 0, errorMsg };
  }

  // 写入 DB(每条独立 try,避免一条挂掉整批失败)
  // Sprint 7 调优:改 upsert — 源站如果改了 imageUrl/时间/地点 我们也要跟进,
  // 顺便让 prompt 迭代能在下一次运行时立即生效(旧的 if existing continue 会卡住)。
  // 翻译有成本,加 heuristic:titleOriginal 没变 → 复用旧翻译,跳过 translate 调用。
  let itemsNew = 0;
  let itemsUpdated = 0;
  for (const raw of rawEvents) {
    try {
      if ((raw.qualityScore ?? 0.7) < 0.5) continue;

      const existing = await prisma.event.findUnique({
        where: { source_sourceUrl: { source: def.id, sourceUrl: raw.sourceUrl } },
      });

      // 是否重新翻译:新插入必翻;已存在的看原 title 是否变化
      const needsTranslate = !existing || existing.titleOriginal !== raw.title;

      let titleZh = existing?.title ?? raw.title;
      let descZh = existing?.description ?? (raw.description ?? '');
      if (needsTranslate) {
        try {
          const t = await translateToChineseSummary({
            title: raw.title,
            description: raw.description,
            location: raw.location,
          });
          titleZh = t.titleZh || raw.title;
          descZh = t.descriptionZh || (raw.description ?? '');
        } catch {
          /* 翻译失败,保留英文/旧值 */
        }
      }

      const data = {
        source: def.id,
        sourceUrl: raw.sourceUrl,
        sourceId: raw.sourceId ?? null,
        title: titleZh,
        titleOriginal: raw.title,
        description: descZh,
        startAt: raw.startAt ? new Date(raw.startAt) : null,
        endAt: raw.endAt ? new Date(raw.endAt) : null,
        location: raw.location ?? null,
        category: def.category,
        imageUrl: raw.imageUrl ?? null,
        qualityScore: raw.qualityScore ?? 0.7,
        publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : null,
        status: 'active',
      };

      if (existing) {
        await prisma.event.update({
          where: { id: existing.id },
          data: { ...data, scrapedAt: new Date() }, // bump scrapedAt 标识最近一次更新
        });
        itemsUpdated++;
      } else {
        await prisma.event.create({ data });
        itemsNew++;
      }
    } catch {
      // 单条出错(数据格式不对等),静默跳过
    }
  }

  // 完成日志
  await prisma.scrapeRun.update({
    where: { id: run.id },
    data: {
      status: 'success',
      finishedAt: new Date(),
      itemsFound: rawEvents.length,
      itemsNew,
    },
  });

  return {
    source: def.id,
    status: 'success',
    itemsFound: rawEvents.length,
    itemsNew,
  };
}

export async function runAllScrapers(defs: SourceDefinition[]): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  for (const def of defs) {
    const r = await runScraper(def);
    results.push(r);
  }
  return results;
}
