# 架构地图（ARCHITECTURE）

> 读者两类：不读代码的项目所有者（建立"改哪炸哪"的直觉），和进来干活的 AI agent（拆任务、判风险、找雷区）。
> 只放结构、边界、不变量和指针，不放实现细节。细节在指向的文件里。
> 勘察基线：2026-09-16 · main `dd2ce74`；9C / 9A 更新 2026-09-17。改动触及本文任一节时，PR 必须同步更新本文。

## 0. 一屏概览

```
浏览器 ──► Next.js 14 App Router（Railway，单实例，sleepApplication）
             ├─ 页面 SSR + 客户端组件         src/app/**/page.tsx · src/components/*
             ├─ API routes                    src/app/api/**/route.ts
             │    └─ Prisma ──► Postgres(prod) / SQLite(dev)
             ├─ 图床 Cloudinary（回落本地 uploads）
             ├─ 邮件 Resend（仅 magic-link）
             └─ LLM DeepSeek（仅 scraper 翻译 / 抽取）
GitHub Actions cron ──► 每日 scrape（POST /api/scraper/run）· 每周 pg_dump 备份 + keepalive commit
```

三个子站共用一套壳、i18n、身份机制和常量表，各自有独立的数据模型与 API：

| 子站 | 路由 | 主模型 | 联系方式披露模式 |
|---|---|---|---|
| 二手 | `/` `/item/[id]` `/cart` `/my` | Item · Inquiry · CartEntry | 卖家直显（**当前无门无限流，见 §5**）；留言人走 reveal |
| 室友 & 转租 | `/roommates` `/listing/[id]` | Listing · Application | 申请-同意双向解锁 |
| 本地信息流 | `/localnews` `/localnews/event/[id]` | Event · EventComment · EventContactSend | 响应者发送 → 发布者反向公开 = 互见 |

## 1. 模块清单

| 模块 | 关键文件 | 依赖 | 被谁依赖 |
|---|---|---|---|
| 基础：DB 单例 | `src/lib/prisma.ts` | — | 几乎所有 route / SSR |
| 基础：常量与展示函数 | `src/lib/utils.ts`（类目、联系方式类型、listing 类型、`parsePhotoUrls`、`getClientIp`、`formatPrice`…） | `src/i18n/messages.ts` | API 层 + 组件层双向依赖。**改一处动全站** |
| 基础：i18n | `src/i18n/messages.ts` · `I18nProvider.tsx`（`localStorage('hb_locale')`） | — | 所有 UI 文案；`utils.ts` 直接读 messages 供 server 侧使用 |
| 壳与埋点 | `src/app/layout.tsx` · `Providers.tsx` · `components/PageViewBeacon.tsx` · `api/pageview` · `lib/utm.ts` | PageView 表 | admin 统计 |
| 二手平台 | 页 `src/app/page.tsx` `item/[id]` `cart` `my`；API `api/items/**` `api/inquiries/**` `api/stats` `api/og/[id]`；组件 `ItemCard` `ItemDetailView` `PostModal` `InquirySection` `FilterSidebar` `ShoppingCartPanel` `BatchImportPanel`…；lib `itemValidation` `batchParser` `sortJitter` `recentViews` `shoppingCart` `shareText` | prisma · uploader · utils | `sitemap.ts` · `MyPostsPanel` · `notifications.ts` |
| 室友平台 | 页 `roommates/page.tsx` `listing/[id]`（仅 OG 后 redirect）；API `api/listings/**` `api/applications/**` `api/og/listing/[id]`；组件 `ListingCard` `ListingPostModal` `ListingApplyModal` `ListingFilterBar`…；lib `listingValidation` `listingMatch` `savedListings` | 同上 | `MyPostsPanel` |
| 活动平台 + scraper | 页 `localnews/page.tsx` `localnews/event/[id]`；API `api/events/**` `api/my/events` `api/og/event/[id]`（edge）`api/scraper/run` `api/admin/cleanup-reddit`；组件 `EventCard` `EventPostModal` `EventCommentSection` `ContactSendModal` `LiveSection` `MyEventsPanel`…；lib `scraper/*`（源注册表 `scraper/index.ts`）`eventArchive` `eventDistance` `eventLocation` `eventNickname` `eventShareText` `savedEvents` | prisma · `llm.ts` | `scrape-events.yml` |
| 身份与鉴权 | `lib/auth.ts`（magic-link session）· `lib/adminAuth.ts` · `lib/identity.ts`（客户端三键身份 facade）· `api/auth/**` · 组件 `SessionTopBar` `EditCodePrompt` | prisma · email | 所有需要编辑 / 删除 / 「我的」的路径 |
| 邮件 / 出站通知 | `lib/email.ts`（Resend 包装）· `lib/digest.ts` + `api/admin/digest`（9D：摘要 + 阈值 + 告警邮件，`daily-digest.yml` 每日调） | `RESEND_API_KEY` `DIGEST_SECRET` `DIGEST_EMAIL_TO` | magic-link；维护告警（举报 / 隐藏 / scraper / 备份 / 披露被拒） |
| 图床 | `lib/uploader.ts` · `api/upload` · `lib/cloudinary.ts` · `PendingCloudinaryDeletion` 延迟删除队列（由 items / listings 列表 GET 机会式触发） | Cloudinary env | 三个发布表单 |
| LLM | `lib/llm.ts`：`llmCall` / `chat`（DeepSeek）· `embed` / `embedMany`（OpenAI 兼容端点）· `isEmbedConfigured` | env | scraper · 搜索 |
| 搜索（10A 起） | `lib/search/embedText.ts`（白名单取字段 → 文本，纯函数）· `vectorStore.ts`（`pgvector` raw SQL / `json` SQLite 两实现，按 `DATABASE_URL` 选；HNSW 索引运行时幂等建）· `indexer.ts`（写入时异步 embed / remove，`substantiveChanged` 判实质性变更）· `backfill.ts` + `scripts/backfill-embeddings.ts` + `api/admin/backfill-embeddings` · **10B**：`lib/itemsQuery.ts`（列表 where / orderBy / 序列化，`api/items` 与 `api/search` 共用）· `lib/search/hybrid.ts`（总开关 `SEARCH_AI_ENABLED`、查询词 embedding 10 分钟缓存、`pickSemantic` 去重与阈值、语义路配额 60 次 / 小时）· `api/search`（第 0 层 + 第 1 层）· 组件 `SemanticResults`（`ItemCard` 加 `badge`）· **10C**：`lib/search/chat.ts`（配额门、历史清洗、白名单候选行与 prompt、输出校验）· `lib/llmUsage.ts`（计费流水、当日预算熔断）· `api/search/chat`（SSE）· 组件 `SearchChat`（就地展开的对话区，状态只在内存） | prisma · llm · rateLimit | items / listings / events 的 POST / PATCH / DELETE / publish、reports 自动隐藏、scraper runner；`app/page.tsx` 有关键词时改调 `api/search` |
| admin | `app/admin/page.tsx`（1329 行，server actions 内联）· `admin/recovery` · `api/recovery/**` | `adminAuth.isAdmin()` · `attemptAdminLogin()`（走 rateLimit） | — |
| 反滥用 | `src/lib/rateLimit.ts`（**唯一入口**）：`getVisitorId` / `readVisitorId` / `setVisitorCookie`（`hb_vid`）、`isBotUA`（basic / full 两档）、`checkQuota`（`RateLimitHit` 表计数的滑动窗口；行只增不减、被拒尝试也计入；tag 去重靠 `(key, tag, bucket)` 唯一约束 + `admitted` 标记，Codex 互审六轮定稿）。12 个 route 的 visitor cookie 与 6 处 bot 判断已迁入；各业务域自己的窗口计数（发布 / 评论 / 申请等）仍读各自的表，见 §6 | prisma | 所有需要访客标识或配额的 route；9A / 9E / 10B / 10C 的配额 |
| 数据与运维 | `prisma/schema.prisma`（dev）· `schema.production.prisma`（prod，手工同步）· `scripts/{backup,restore-local}.sh` · `.github/workflows/{ci,backup,scrape-events}.yml` · `railway.json` | — | — |

## 2. 数据模型与个人数据

20 个 model（Sprint 9C 加 `RateLimitHit`；10A 给 `Item` / `Listing` / `Event` 加 `embeddedAt` `embedVersion` 与向量列；10C 加 `LlmUsage`——LLM 调用计费流水，只有端点 / 模型 / token 数 / 估算费用 / 日期，不含任何用户内容或标识）。两份 schema 字段一致，差异仅 provider、`binaryTargets`、`extensions`、注释，CI 用 `scripts/check-schema-sync.mjs` 逐行比对（9F）。**唯一的字段级豁免**（10A）：`Item` / `Listing` / `Event` 的向量列，dev 是 `embeddingJson String?`，prod 是 `embedding Unsupported("vector(1536)")?`，白名单写死在检查脚本里；`embeddedAt DateTime?` 两边相同。向量列不含个人数据（输入文本见 §8.11），Prisma 客户端看不见 prod 的 `embedding`，只能经 `vectorStore.ts` 的 raw SQL 读写。

关系：`Item 1-N Inquiry / CartEntry / ItemViewThrottle / Report`；`Listing 1-N Inquiry / Application / ListingViewThrottle / Report`；`Application.attachedListingId → Listing`。`Event` 与 `EventComment` / `EventContactSend` / `EventClickThrottle` **无外键**，仅 `eventId` 字符串软关联，删除必须手工级联。

个人数据落点（隐私分级的依据）：

| 类别 | 字段 | 档 |
|---|---|---|
| 联系方式明文 | `Item/Inquiry/Listing/Application.contactValue` · `Event.posterContact` · `EventContactSend.fromContact` · `RecoveryRequest.targetContactValue/applicantWechat` | 半公开：发布者同意可见，**不可批量枚举** |
| 邮箱 | `MagicLinkToken.email` · `UserSession.email` | 私有 |
| IP | `Item/Inquiry/Listing/Application.ipAddress` · `Report.reporterIp` · `RecoveryRequest.ipAddress`（`PageView` 不存 IP） | 私有，**永不出网** |
| 凭证 | `*.editCodeHash` `Event.posterCodeHash`（bcrypt 10）· `UserSession.sessionToken`（明文）· `RecoveryRequest.resolvedEditCode`（**明文新密码**） | 私有 |
| 伪标识 | `hb_vid` 派生的各 `visitorId`、`RateLimitHit.key`（含 visitorId / IP） | 私有 |

## 3. 身份与鉴权

| 机制 | 位置 | 保护什么 | 备注 |
|---|---|---|---|
| editCode + bcrypt | 各 `route.ts` 写入；`[id]` / `publish` / `verify-code` 校验 | 编辑、删除、发布草稿、卖家回复、申请同意 / 撤回 | 不可找回；`verify-code` **无限流** |
| contactValue + editCode 双凭证 | `*/by-contact` POST | 「我的」面板 | 先取 ≤200 行再逐行 bcrypt，O(N) CPU |
| contactValue 单凭证 | `*/by-contact` GET · `api/my/events?contact=` | 基本不构成保护 | 知道微信号即可反查，见 §5 |
| `hb_vid` cookie（HttpOnly，1 年） | `lib/rateLimit.ts` 统一生成与读取 | 活动评论作者、联系方式交换、reveal-to-responder 的发布者鉴权、view / cart 去重、UV | 统一 helper，属性：httpOnly · lax · secure(prod) · 1 年 |
| magic-link session | `api/auth/magic-link/*` · `lib/auth.ts` · `hb_session` | **不保护任何资源**，只做预填与身份连续性 | 15 分钟 token，同邮箱 60s 限流 |
| admin 会话 | `lib/adminAuth.ts` · `hb_admin` | `/admin` `/api/recovery` `api/admin/*` | 9E 起：HMAC 签名令牌（iat + nonce），密钥 = HMAC(`ADMIN_SESSION_SECRET` 或 scrypt(密码), 密码)，密码变动即全部失效；常量时间比较；登录同 IP 10 次尝试 / 15 分钟；IP 取 XFF 最后一段（仅信任 Railway 一层代理） |
| `SCRAPER_SECRET` bearer | `api/scraper/run` | 触发抓取 | 未配置直接拒跑 |

## 4. 数据流（一次发布到一次被看见）

发布表单 → `POST /api/{items,listings,events}`（IP 限流、校验、bcrypt 编辑码、存 `ipAddress`）→ 状态 `draft` / `active` → 列表 GET（`status='active'`，二手排除 `category='housing'`，按 `bumpedAt` 排）→ 卡片展开（`view` 去重计数）→ 联系方式披露（各子站不同，§5）→ 留言 / 申请 / 响应（各自限流）→ `bumpedAt` 刷新。scraper 走 `api/scraper/run` → `scraper/runner.ts` → 各源 → LLM 抽取翻译 → `Event`（`@@unique(source, sourceUrl)` 去重）。

## 5. 联系方式披露面（Sprint 9A 后）

所有下发联系方式的接口都经 `src/lib/contactQuota.ts` 的 `gateReveal`：bot UA 403；同 visitor 30/h、120/d，同 IP 60/h；同 visitor 同目标重复不计；超限 429 + `Retry-After`。

| 端点 | 公开? | 门 | 限流 |
|---|---|---|---|
| `GET /api/items` · `/item/[id]` SSR | 是 | **不含联系方式**（`contactValue: ''`），`ipAddress` / `utmSource` / `editCodeHash` 不出网 | 无 |
| `POST /api/items/[id]/reveal-contact` · `POST /api/inquiries/[id]/reveal-contact` | 是 | 唯一下发口；客户端展开卡 / 挂载详情页时调 | gateReveal，tag = `item:<id>` / `inq:<id>` |
| `GET /api/items/by-contact` | 是 | 白名单 select，不含联系方式 / IP / hash；limit ≤ 30 | gateReveal，tag = `by:<value>` |
| `GET /api/listings` · `GET /api/listings/by-contact` | 是 | 白名单，`contactValue` 置空，IP / hash 不出网 | 无 |
| `POST /api/applications/by-contact` | 否 | 双凭证；对方 contact 仅 `approved` 后透出（室友非对称交换的服务端门） | 无 |
| `GET /api/events` · event SSR 页 | 是 | **`posterContactPublic` 在服务端生效**：非公开时 `posterContact` / type / label 置 null | 无 |
| `POST /api/events/[id]/contact-send` · `reveal-to-responder` | 需 `hb_vid` | unique 约束 + 发布者 visitorId 校验 | 无 |
| `GET /api/my/events` | `hb_vid` | `?contact=` 明文反查分支已移除 | 无 |
| `*/verify-code`（items / listings / events） | 是 | 编辑密码校验；items 成功时返回所有者联系方式供编辑预填 | 10 次尝试 / 15 分钟 / IP（计数先于比较，并发不可绕） |
| `GET /api/events/[id]/og-data` · 三个 `api/og/*` · `sitemap.ts` | 是 | 白名单，不含联系方式 | 60s / 1h 缓存 |

同卖家过滤已改为 `?sameSellerAs=<itemId>`，服务端由 item 反查卖家，联系方式不进 URL、不进响应。

## 6. 反滥用现状

- （10C）对话 `POST /api/search/chat`：bot UA 403；同 visitor 20 条 / 小时、100 条 / 天，同 IP 60 条 / 小时（`chat:vid:<id>:h|d` `chat:ip:<ip>:h`）；超限 429 带中英提示与 `Retry-After`。费用护栏：`LlmUsage` 当日合计 ≥ `SEARCH_AI_DAILY_BUDGET_USD`（默认 2 美元）→ 503，UI 隐藏第 2 层，第 1 层不受影响。预算是**先预留后结算**（`reserveBudget` 在一个事务里取按日咨询锁 `pg_advisory_xact_lock`、写一行按保守上限估的预留、读合计，超了回滚并拒绝；并发被串行化，不会同时放行也不会全部互拒；请求一旦发出，即使被取消 / 超时也保留预留额），单价取 DeepSeek **高峰、缓存未命中**价（宁可高估）；配额表或计费表读写失败一律 **fail closed**（503，只关第 2 层）。客户端断开会经 `req.signal` 取消在途的 LLM 调用并撤回预留。
- （10B）语义搜索：同 visitor 60 次 / 小时（`search:vid:<id>:h`，含按钮触发）+ 同 IP 300 次 / 小时（`search:ip:<ip>:h`，防轮换 cookie），bot UA 只给关键词层；限流只砍语义路，关键词层永不受影响（配额表读写失败也只是没有语义层）。自动触发被限 → 200 + `limited`，按钮触发被限 → 429（body 仍含 keyword）。客户端两段式：先 `semantic=0` 拿关键词层，再 `semantic=1` 要语义层，关键词层永远不等 embedding。

访客标识与 bot 判断已统一进 `lib/rateLimit.ts`；通用配额 `checkQuota` 由 `contactQuota.ts`（披露）与三处 `verify-code`（失败限流）使用。各业务域的窗口计数仍是内联查各自的表：IP 发布限流（items / listings 1h 10 条，applications 1h 5 条，inquiries 1h N 条）；visitor 限流（用户活动每日 3 条，评论 60s 一条 + 1h 20 条）；magic-link 同邮箱 60s；recovery 同 IP 24h 3 次、3 个不同 IP 自动标 abuse；举报 3 个不同 IP 自动隐藏；view / click / cart 靠 throttle 表去重；bot UA 过滤 6 处（click / view×2 / pageview 用 full 档，events POST / comments 用 basic 档，沿用各自原有词表）。**无限流的面**：各列表 GET（已不含联系方式）、`listings/by-contact` GET（已脱敏）。进程内存态：`eventArchive.ts` 的 5 分钟节流、`uploader.ts` 的配置缓存，多实例即失效。

## 7. 外部依赖与失败模式

| 依赖 | env | 未配 / 宕机 |
|---|---|---|
| Cloudinary | `CLOUDINARY_*` | 未配回落 `public/uploads/`（容器重启即丢）；宕机上传 500，发帖卡在图片步 |
| Resend | `RESEND_API_KEY` `EMAIL_FROM_ADDRESS` | dev 打 console；prod 未配 magic-link 不可用，编辑码主路径不受影响 |
| DeepSeek | `LLM_*` | scraper 该源标 failed 继续下一源；前台不受影响，只是不入新活动。**thinking 模式默认开启**（该模式下 `temperature` 无效、推理 token 计入输出并吃 `max_tokens`）：10C 的 `chatWithUsage` 显式传 `thinking: {type:'disabled'}`（仅对 DeepSeek 附带该字段）；scraper 的调用尚未处理 |
| Embedding（OpenAI） | `LLM_EMBED_API_KEY` `LLM_EMBED_MODEL` | 未配：发帖照常成功，`embeddedAt` 留空，一行 warn；宕机：单条 embed 失败只记日志，等回填。任何 AI 侧错误都不影响发布与关键词搜索 |
| pgvector | `DATABASE_URL`（Railway `postgres-ssl:18` 镜像自带） | 扩展缺失时 preDeploy `db push` 会失败（`extensions = [vector]`）；HNSW 索引缺失只是退化为顺序扫描 |
| 源站 | — | 改版是最可能的静默失效点，只在 `ScrapeRun.errorMsg` 里可见 |
| Railway | `DATABASE_URL` `NEXT_PUBLIC_SITE_URL` | 后者未设则硬编码回落到 railway 域名；`sleepApplication` 带来冷启动 |
| Actions cron | secrets `DATABASE_URL` `SCRAPER_SECRET` `DIGEST_SECRET`，vars `SCRAPER_ENDPOINT` `DIGEST_ENDPOINT` `DIGEST_THRESHOLDS` | backup 写死 pg 18 全路径；artifact 90 天；60 天无 commit 即被禁用（靠 keepalive commit）；digest 每日 13 UTC，越阈值才发邮件 |

## 8. 不变量（改之前必须知道）

1. `GET /api/items` 的 `NOT: { category: 'housing' }`：历史 housing 行仍在表里，靠它隐藏；`utils.ts` 多处保留 housing 展示兜底。
2. `bumpedAt` = 最近活跃；只有实质性编辑（标题 / 描述 / 价格 / 图 / 类型 / 类目）、新询价、卖家回复、新申请、草稿转正会刷新；改联系方式 / 自定义标签**故意不刷新**。
3. `editCodeHash` 永不出网。列表 GET 仍靠手写 `undefined`（items 已补 `ipAddress` / `utmSource`），两个 by-contact GET 已改白名单 select。新增返回字段时优先白名单。
4. `EventContactSend @@unique(eventId, fromVisitorId, toVisitorId)`：同方向一条；双向两条 = 互见。这就是整个非对称协议。
5. `Event @@unique(source, sourceUrl)`：scraper 去重基础；用户发帖用 `internal:u-<ts>-<rand>` 占位。
6. `[skip ci]` 与 `railway.json` `watchPatterns: ["**", "!.github/**"]` 互锁：Railway 不认 `[skip ci]`，改任一侧 = 每周一次无谓生产部署。
7. localStorage / cookie 键名不可改：`hb_vid` `hb_session` `hb_admin` `hb_locale` `hb_recent_views` `hb_my_contact_*` `hb_last_contact`，老用户已有数据。
8. `schema.production.prisma` 与 dev schema 手工同步；`db:push:prod --accept-data-loss` 在 preDeploy 跑，**漏同步 = 生产直接掉列**。9F 起 CI 用 `scripts/check-schema-sync.mjs` 归一化后逐行比对，不一致即红。
9. 改 OG 卡片必须 bump `shareText.ts` 的 `OG_VERSION` 和 event 页的 `OG_IMG_VERSION`（微信缓存）。
10. （Sprint 9 起）任何公开列表接口不得携带联系方式；联系方式只能经 `gateReveal` 配额的逐条接口或双向同意流程下发；序列化一律白名单；每一种需要人处理的状态必须有一条出站路径。前端「展开即见」只在展开态取数，桌面端折叠态不再直显。
12. （Sprint 10C 起）**LLM 的输出不直接给用户**：对话接口先在服务端完整校验——JSON 解析失败走兜底文案 + 前 3 个候选；`itemIds` 与检索候选集合求交集，集合外的 id 丢弃；`summary` 过联系方式检测（先 NFKC 归一化；邮箱 / 手机号 / 长数字硬模式 + "渠道关键词与像账号的串同时出现"的组合判定，宁可误杀），命中整句换兜底并记日志；候选帖子（陌生人发布的低信任数据）以转义过的 JSON 放在 user 消息的 `<candidates>` 里，**不进 system 角色**——通过后才以 SSE 分片下发。卡片的价格 / 图片 / 联系方式一律由数据库渲染（与 `/api/items` 同款脱敏），联系卖家只能走 9A 的披露流程。客户端传来的 `history` 只认 `user` / `assistant` 两种角色。LLM 没有任何写操作能力（无 tools）。
11. （Sprint 10 起）**送入 embedding 与 LLM 的文本永远不含** `contactValue`、`customContactLabel`、`posterContact`、`ipAddress`、`email`、任何 hash / token / visitorId。只允许标题、描述、价格、类目、自定义标签、区域 / 地点、时间、图片 URL、帖子 id。实现上只经 `lib/search/embedText.ts` 的白名单 `*_EMBED_SELECT` 读库、显式取字段构造文本，**不 spread**；单测用含微信号 / 手机号 / 邮箱的 fixture 断言输出不含它们。AI 侧任何失败（key 缺、API 挂、维度不对）都降级为"没有向量 / 没有补充结果"，不能让发布或关键词搜索失败。

## 9. 雷区与技术债

- 超 400 行文件 17 个，最大：`MyPostsPanel.tsx` 1511 · `admin/page.tsx` 1329 · `MyEventsPanel.tsx` 1136 · `ListingPostModal.tsx` 856 · `EventCard.tsx` 792。AI 在这些文件里出错率最高，改动前先读整段上下文。
- 死代码：`components/PlatformSwitcher.tsx`（文件头 TODO 标删）、`scripts/migrate-housing-to-listings.ts`（废弃占位）。
- 权宜实现：event 举报用 `reason` 前缀 `[event:<id>]` 匹配（无外键）；`listingMatch.ts` v1 仅 2 维。
- HNSW 索引不在 Prisma schema 里（索引类型不支持），由 `vectorStore.ensureIndex` 用 `CREATE INDEX CONCURRENTLY IF NOT EXISTS` 幂等建，**只在回填脚本与 admin 探针路径调用，发布请求路径不跑 DDL**；preDeploy 的 `db push` 是否会把它当 drift 删掉未实测，删了下次回填重建。当前 `nearest` 用 `OFFSET 0` 栅栏强制"先过滤后精确排序"，不走 HNSW 近似（候选集小时 HNSW 会漏结果），索引留给以后的全局查询。
- `vectorStore.nearest` 的过滤是"调用方先用 Prisma where 查出候选 id 再传入"，不是 spec 里的 `filterSql`；两个后端共用一份过滤逻辑，代价是候选 id 列表随数据量线性增长（几百行无感，上万行再改）。
- 向量生命周期规则：只为 `active` / `draft` 行维护（`upsert` 自带 status 守卫）；删除与举报隐藏清向量，admin 恢复补向量；`fulfilled` / `canceled` / `expired` 不清，靠查询侧 status 过滤。实质性编辑在同一条 update 里 `embeddedAt = null, embedVersion += 1`（`INVALIDATE_EMBEDDING`），embed 失败由回填捞回；embed 是异步的，`upsert` 在同一条 UPDATE 里校验 `embedVersion = 读取时版本 AND status 可检索`，不匹配返回 false 丢弃结果（乱序 / 删后写回防线，indexer 与回填共用）。
- dev / SQLite 的 `embeddingJson` 靠 `lib/prisma.ts` 的全局 `omit`（`omitApi` preview）挡在默认 select 之外，否则任何 `...row` spread 的响应都会带出 30KB 向量；omit 按 `DATABASE_URL` 分支（Postgres 没这列，omit 不存在的字段会报错）。显式 `select` 可越过 omit，这是 `JsonVectorStore` 读向量的方式。

## 10. 测试与门禁现状

vitest：活动侧纯函数 + 9C 起的 `rateLimit` / `contactQuota` / `adminAuth`；e2e 一个 smoke（13 条：SSR 路由、发布弹窗、API 形状）。**9F 起 CI 门禁 = typecheck → lint → vitest → schema 一致性 → build → e2e smoke（`next start`，空 SQLite）**。仍零覆盖：大部分 API route 的业务逻辑、校验 lib、组件。

## 11. 风险分级（AI 开 PR 先自报）

| 级 | 触及 | 门禁 |
|---|---|---|
| 0 | 文档、文案、i18n | typecheck + lint |
| 1 | 单个组件 UI、样式、静态页 | + build + vitest + 390px 目检 |
| 2 | API route、schema、鉴权、限流、披露面、workflow、`utils.ts` | + AI 对照 spec 自检（附证据）+ 跨厂互审 |
| 3 | 数据迁移、删数据、改 cookie / localStorage 键名、`db:push` 行为 | + 所有者合并前显式拍板 |

判定规则：触及本文 §5 §6 §8 任何一行即至少 2 级。

## 12. 维护本文

- 每个 PR 若改了模块边界、数据模型、披露面、限流、外部依赖或不变量，同一 PR 内更新对应小节并改勘察基线。
- 本文只记"是什么、在哪、为什么不能动"。"接下来做什么"在 `STATE.md`，"当时为什么这么决定"在 `docs/decisions/`（待建）。
