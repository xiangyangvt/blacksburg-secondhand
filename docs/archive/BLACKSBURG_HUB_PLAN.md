# 黑堡本地 Hub — Sprint 7 计划(从二手交易站升级为本地华人门户)

> 创建:2026-05-14
> 状态:Phase 1 已锁定,开始施工
> 关联文档:[PLAN.md](./PLAN.md) · [UX_BATCH.md](./UX_BATCH.md) · [PROFESSIONAL_PLAN.md](./PROFESSIONAL_PLAN.md)

---

## 一、产品定位 pivot

### 1.1 背景

毕业季后二手交易呈结构性失衡:学生离场 = 供过于求 + 没人买。继续做二手 UX 优化也救不了循环。仓储服务能解但 Sean 当前没收入,投入门槛太高。

**Pivot 方向**:把站升级为「**黑堡本地华人门户**」,信息流为粘性引擎,二手 + 室友&转租作为子平台保留。

### 1.2 IA 层级

```
黑堡 (大框架 / brand / 入口)
  ↓ /localnews
信息流 hub
  ├ Event 卡片(本地活动 / 体育 / 新闻 / 讨论)
  └ Chat 入口(Phase 3 实做)
  
sub-platforms(原有,导航不变):
  ├ 二手 (/) — Sean 现在维护态
  └ 室友&转租 (/roommates) — Sean 现在维护态
```

**Wordmark "黑堡"** 改成 clickable,点击进 `/localnews`。在 /localnews 上 wordmark 高亮 brand 色表示"你在这"。

### 1.3 用户价值

- **不依赖交易闭环**:只要内容持续更新就有粘性
- **流量入口**:用户来扫一眼有什么新事 → 顺便发现二手在售物
- **品牌延伸**:"黑堡" 从二手站名升级成华人本地社区门户

---

## 二、技术栈(2026 主流)

| 层 | 选型 | 理由 |
|---|---|---|
| **抓取** | 直 fetch + Cheerio(静态)+ DeepSeek V4 Flash extract(HTML → JSON) | LLM extract 替代手写 CSS selector,HTML 变了 LLM 自适应,维护成本骤降。Phase 1 不引入 Playwright(多数源是静态 HTML 或 JSON API) |
| **LLM provider** | DeepSeek V4 系列 + OpenAI embed | V4 Pro 给 chat / V4 Flash 给 utility(extract/translate)/ OpenAI text-embedding-3-small 给 embedding。env 抽象,任意 provider 可换 |
| **DB** | 复用 Railway Postgres + pgvector 扩展 | 不新增 DB。本地 SQLite 不支持 vector,Phase 1 不算 embedding(Phase 3 chat 才需要) |
| **chat streaming** | Vercel AI SDK(Phase 3) | Next.js 原生,SSE 流式,多 provider 适配 |
| **抓取定时** | GitHub Actions cron 每天 1 次(早上 7 AM EST) | 免费,触发 Next.js API endpoint 跑抓取 |
| **frontend** | 复用 Next.js 14 App Router + Tailwind | 跟现有站一致 |

---

## 三、Phase 1 范围

**单 sprint 目标**:**信息流 MVP** — 11 个源,中文呈现,每天早上 7 AM 自动抓取。

**Phase 1 不做**:Chat / embedding / 复杂筛选 / 个性化。这些 Phase 2-3 再说。

### 3.1 11 个抓取源(Phase 1 启动)

**T0 必装(events / 高频)**:
1. nextthreedays.com — NRV 总事件聚合
2. stepintoblacksburg.org — Blacksburg 社区活动日历
3. blacksburg.gov/community/community-engagement/calendar — 政府官方
4. downtownblacksburg.com — 商业区活动
5. calendar.vt.edu — VT 主日历
6. hokiesports.com — VT 体育赛事
7. thelyric.com — Lyric 剧院(电影 + 音乐)
8. eventbrite.com/d/va--blacksburg/events/ — Eventbrite Blacksburg

**T1 补充(discussion / news,只抓 headline + URL,版权安全)**:
9. reddit.com/r/VirginiaTech/.json — JSON API
10. collegiatetimes.com — VT 学生报头条
11. roanoke.com Blacksburg section — 当地新闻

**抓取策略**:
- 只抓 metadata + URL(title / time / location / 1 张图 URL / 摘要),**不抓全文**(版权安全)
- robots.txt 严格尊重(每源先扫一遍)
- Eventbrite 优先用官方 API(如果可注册),fallback HTML
- Reddit 用 `.json` 后缀(免费 + 官方支持)

### 3.2 显示策略

**中文主 + 英文专有名词保留**(店名 / 街道 / 活动名 / VT 队名等):

```
Trivia Night @ Champs
周三晚 7 点 · Champs Sports Grille · 免费
一周三次的小问答比赛,赢者免一餐
来源: nextthreedays.com →
```

LLM 翻译 prompt:"翻译成自然中文,保留店名/街道名/活动名等英文专有名词。输出 ≤ 200 字精炼摘要"。

### 3.3 数据模型

```prisma
model Event {
  id              String    @id @default(cuid())
  source          String    // 'nextthreedays' | 'blacksburg_gov' | ...
  sourceUrl       String    // 原始 URL
  sourceId        String?   // 源站 ID(用于 dedup)

  title           String    // 中文 + 英文专有名词混排
  titleOriginal   String?   // 英文原始标题
  description     String?   // 中文摘要 ≤ 200 字

  startAt         DateTime?
  endAt           DateTime?
  location        String?

  category        String?   // 'events' | 'sports' | 'news' | 'discussion'
  imageUrl        String?
  qualityScore    Float     @default(0.7)

  scrapedAt       DateTime  @default(now())
  publishedAt     DateTime?

  // Phase 3 chat 用,Phase 1 留空
  // embedding    Unsupported("vector(1536)")?

  status          String    @default("active")  // active | hidden | expired

  @@unique([source, sourceUrl])
  @@index([startAt])
  @@index([source])
  @@index([status, startAt])
  @@index([category])
}

model ScrapeRun {
  id          String    @id @default(cuid())
  source      String
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?
  status      String    // running | success | failed
  itemsFound  Int       @default(0)
  itemsNew    Int       @default(0)
  errorMsg    String?

  @@index([source, startedAt])
}
```

### 3.4 文件清单

**新文件**:
- `src/lib/llm.ts` — provider 抽象(chat / utility / embed 分组)
- `src/lib/scraper/types.ts` — RawEvent + SourceDefinition 接口
- `src/lib/scraper/index.ts` — 跑流程的总入口
- `src/lib/scraper/sources/nextthreedays.ts` — etc, 11 个源每个一个文件
- `src/lib/scraper/translate.ts` — 翻译辅助
- `src/lib/scraper/dedup.ts` — 跨源去重
- `src/app/api/scraper/run/route.ts` — 抓取触发 endpoint(GitHub Action 调用)
- `src/app/localnews/page.tsx` — 信息流页面
- `src/components/EventCard.tsx` — 事件卡片
- `prisma/migrations/2026...add_events/migration.sql`
- `.github/workflows/scrape-events.yml` — cron workflow

**修改文件**:
- `prisma/schema.prisma` + `schema.production.prisma` — 加 Event + ScrapeRun
- `package.json` — 加 `openai` + `cheerio` 依赖
- `src/components/PlatformTabs.tsx` — wordmark "黑堡" 改 clickable + active 态(实际上 wordmark 在 page.tsx / roommates/page.tsx 里,不在 PlatformTabs,需改两处)

### 3.5 LLM 抽象层(env 配置)

```env
# Chat (V4 Pro, RAG)
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=sk-xxx
LLM_CHAT_MODEL=deepseek-v4-pro
LLM_UTILITY_MODEL=deepseek-v4-flash  # 翻译 + extract

# Embedding (OpenAI,DeepSeek 没 embed 模型)
LLM_EMBED_BASE_URL=https://api.openai.com/v1
LLM_EMBED_API_KEY=sk-yyy
LLM_EMBED_MODEL=text-embedding-3-small

# Scraper auth (GitHub Action → API endpoint)
SCRAPER_SECRET=randomtoken
```

切换 provider 改 env,代码 0 改动。

### 3.6 GitHub Action cron

```yaml
# .github/workflows/scrape-events.yml
name: Scrape Local Events
on:
  schedule:
    - cron: '0 11 * * *'  # 7 AM EST (UTC-4)
  workflow_dispatch:  # 手动触发
jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger scraper
        run: |
          curl -X POST https://blacksburg-secondhand-production.up.railway.app/api/scraper/run \
            -H "Authorization: Bearer ${{ secrets.SCRAPER_SECRET }}" \
            -H "Content-Type: application/json" \
            -d '{}'
```

简单 webhook 模式。重活在 Railway 上跑(已有 Postgres connection 等)。

---

## 四、成本估算

按 100 日活, V4 Pro/Flash 促销价(2026/05/31 前):

| 项 | 月调用量 | 成本 |
|---|---|---|
| 抓取 extract(V4 Flash) | 11 源 × 平均 5 events/天 × 30 天 = 1650 events × 2k tok | ~$0.20 |
| 翻译(V4 Flash) | 1650 events × 500 tok | ~$0.10 |
| Embedding(Phase 3 才用) | — | — |
| Chat(Phase 3 才用,V4 Pro + 缓存) | — | — |
| **Phase 1 合计** | | **~$0.30 / 月** |

Phase 3 chat 上来后总成本 ~$4-5 / 月(详见上一轮调研)。

---

## 五、风险

1. **抓取源 ToS / robots.txt** — Phase 1 实施前每源扫一遍 robots.txt,有禁止的跳过
2. **抓取出错告警** — LLM extract 输出 schema 不符时,捕获 + 写 ScrapeRun.errorMsg,失败 ≥3 次连发邮件提醒
3. **垃圾内容污染** — qualityScore < 0.5 不展示,LLM 在 extract 时自评
4. **隐私 / 数据合规** — chat 内容会发到 DeepSeek 服务器(墙外有法律审查),`/localnews` 页面注脚加说明
5. **冷启动 SEO** — `/localnews` 加 sitemap + meta tags,event detail 加 Schema.org `Event` JSON-LD
6. **本地 dev 无 pgvector** — Phase 1 不用 vector,本地 SQLite 不影响。Phase 3 上来时本地 dev 用 stub embedding

---

## 六、Phase 1 任务拆分(估时 20h)

| # | 子项 | 估时 |
|---|---|---|
| 1 | Postgres schema 加 Event + ScrapeRun + pgvector 扩展启用 | 1h |
| 2 | `src/lib/llm.ts` provider 抽象 | 1.5h |
| 3 | scraper 通用脚手架(fetch + extract + translate + dedup + DB write) | 3h |
| 4 | source #1 nextthreedays.com 集成(proof-of-concept) | 1.5h |
| 5 | sources #2-#11 集成(模板复用,每个 ~0.7h) | 7h |
| 6 | `/api/scraper/run` 触发 endpoint + auth | 1h |
| 7 | GitHub Actions cron workflow | 0.5h |
| 8 | `/localnews` 页面 + EventCard 组件 + filter chips | 3h |
| 9 | Wordmark "黑堡" 改 clickable + active 态 | 0.5h |
| 10 | 部署 + 端到端验证 + 抓取一遍真实数据 + 调优 | 2h |
| 总 | | **20h** |

---

## 七、Phase 2-4 backlog(Phase 1 完看效果再说)

- **Phase 2**:多源去重精修 + 筛选 chips + 全文搜索(pg_trgm)
- **Phase 3**:Embedding + 语义搜索(pgvector)+ Chatbot(V4 Pro + Vercel AI SDK)
- **Phase 4**:抛光 + JSON-LD + 过期清理 cron + 分享单 event

---

## 八、Sean 本地需要跑的命令(每个 phase 合并前)

```bash
git pull
npm install           # Phase 1 加 openai + cheerio
npm run db:migrate    # 应用新 events migration

# 跑一次抓取验证
curl -X POST http://localhost:3000/api/scraper/run \
  -H "Authorization: Bearer $SCRAPER_SECRET"

# 部署
./deploy.sh "feat: sprint 7 phase 1 — 黑堡本地信息流 MVP(11 源 + 中文摘要)"
```

部署后 Railway 需要在 dashboard 设置 4 个新 env:
- `LLM_API_KEY`(DeepSeek API key)
- `LLM_EMBED_API_KEY`(OpenAI API key,只用 embedding)
- `SCRAPER_SECRET`(随机 token)
- `NEXT_PUBLIC_SCRAPER_FREQ_HINT`(可选,前端显示"每天早上更新")

GitHub repo 也需配 `SCRAPER_SECRET` secret 给 Action 用。

---

## 九、下一步

⏳ Phase 1 子项 1-9 顺序施工。每完一组报告 Sean,继续下一组。
⏳ Phase 1 完成 → 部署 → 验证 → Sean 拍板 Phase 2 是否启动。
