# 架构地图（ARCHITECTURE）

> 读者两类：不读代码的项目所有者（建立"改哪炸哪"的直觉），和进来干活的 AI agent（拆任务、判风险、找雷区）。
> 只放结构、边界、不变量和指针，不放实现细节。细节在指向的文件里。
> 勘察基线：2026-09-16 · main `dd2ce74`；9C 更新 2026-09-17。改动触及本文任一节时，PR 必须同步更新本文。

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
| 邮件 | `lib/email.ts`（Resend 包装） | `RESEND_API_KEY` | 仅 `api/auth/magic-link/send`。**没有服务端主动通知** |
| 图床 | `lib/uploader.ts` · `api/upload` · `lib/cloudinary.ts` · `PendingCloudinaryDeletion` 延迟删除队列（由 items / listings 列表 GET 机会式触发） | Cloudinary env | 三个发布表单 |
| LLM | `lib/llm.ts`：`llmCall` / `chat`（DeepSeek）· `embed`（OpenAI 兼容端点，**无调用方，为搜索预埋**） | env | scraper |
| admin | `app/admin/page.tsx`（1329 行，server actions 内联）· `admin/recovery` · `api/recovery/**` | `adminAuth.isAdmin()` | — |
| 反滥用 | `src/lib/rateLimit.ts`（**唯一入口**）：`getVisitorId` / `readVisitorId` / `setVisitorCookie`（`hb_vid`）、`isBotUA`（basic / full 两档）、`checkQuota`（`RateLimitHit` 表计数的滑动窗口；行只增不减、被拒尝试也计入；tag 去重靠 `(key, tag, bucket)` 唯一约束 + `admitted` 标记，Codex 互审六轮定稿）。12 个 route 的 visitor cookie 与 6 处 bot 判断已迁入；各业务域自己的窗口计数（发布 / 评论 / 申请等）仍读各自的表，见 §6 | prisma | 所有需要访客标识或配额的 route；9A / 9E / 10B / 10C 的配额 |
| 数据与运维 | `prisma/schema.prisma`（dev）· `schema.production.prisma`（prod，手工同步）· `scripts/{backup,restore-local}.sh` · `.github/workflows/{ci,backup,scrape-events}.yml` · `railway.json` | — | — |

## 2. 数据模型与个人数据

19 个 model（Sprint 9C 加 `RateLimitHit`）。两份 schema 目前字段一致，差异仅 provider、`binaryTargets`、注释；**没有 CI 保证它们一致**（雷区 8）。

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
| admin cookie | `lib/adminAuth.ts` · `hb_admin` | `/admin` `/api/recovery` `api/admin/*` | **cookie 值 = 明文 `ADMIN_PASSWORD`**，非常量时间比较 |
| `SCRAPER_SECRET` bearer | `api/scraper/run` | 触发抓取 | 未配置直接拒跑 |

## 4. 数据流（一次发布到一次被看见）

发布表单 → `POST /api/{items,listings,events}`（IP 限流、校验、bcrypt 编辑码、存 `ipAddress`）→ 状态 `draft` / `active` → 列表 GET（`status='active'`，二手排除 `category='housing'`，按 `bumpedAt` 排）→ 卡片展开（`view` 去重计数）→ 联系方式披露（各子站不同，§5）→ 留言 / 申请 / 响应（各自限流）→ `bumpedAt` 刷新。scraper 走 `api/scraper/run` → `scraper/runner.ts` → 各源 → LLM 抽取翻译 → `Event`（`@@unique(source, sourceUrl)` 去重）。

## 5. 联系方式披露面（当前状态，Sprint 9 的改造对象）

| 端点 | 公开? | 门 | 限流 |
|---|---|---|---|
| `GET /api/items` · `/item/[id]` SSR | 是 | **无**，卖家 `contactValue` 随列表返回 | 无 |
| `POST /api/items/[id]/reveal-contact` · `POST /api/inquiries/[id]/reveal-contact` | 是 | 无 | 无 |
| `GET /api/items/by-contact` | 是 | 知道 contactValue 即可；**spread 泄漏 `ipAddress` `utmSource`** | 无 |
| `GET /api/listings` | 是 | `contactValue` 置空、`ipAddress` 擦除（**这是正确做法**） | 无 |
| `GET /api/listings/by-contact` | 是 | **未擦 `contactValue` / `ipAddress`** | 无 |
| `POST /api/applications/by-contact` | 否 | 双凭证；对方 contact 仅 `approved` 后透出（室友非对称交换的唯一服务端门） | 无 |
| `GET /api/events` · event SSR 页 | 是 | **`posterContact` 无条件返回**，`posterContactPublic` 仅前端开关 | 无 |
| `POST /api/events/[id]/contact-send` · `reveal-to-responder` | 需 `hb_vid` | unique 约束 + 发布者 visitorId 校验 | 无 |
| `GET /api/my/events?contact=` | 是 | **明文联系方式反查，无二次凭证**，且有标记已读副作用 | 无 |
| `GET /api/events/[id]/og-data` · 三个 `api/og/*` · `sitemap.ts` | 是 | 白名单，不含联系方式 | 60s / 1h 缓存 |

## 6. 反滥用现状

访客标识与 bot 判断已统一进 `lib/rateLimit.ts`；通用配额 `checkQuota` 可用但尚无调用方（9A / 9E 接入）。各业务域的窗口计数仍是内联查各自的表：IP 发布限流（items / listings 1h 10 条，applications 1h 5 条，inquiries 1h N 条）；visitor 限流（用户活动每日 3 条，评论 60s 一条 + 1h 20 条）；magic-link 同邮箱 60s；recovery 同 IP 24h 3 次、3 个不同 IP 自动标 abuse；举报 3 个不同 IP 自动隐藏；view / click / cart 靠 throttle 表去重；bot UA 过滤 6 处（click / view×2 / pageview 用 full 档，events POST / comments 用 basic 档，沿用各自原有词表）。**无限流的面**：所有列表 GET、两个 reveal-contact、by-contact GET、verify-code。进程内存态：`eventArchive.ts` 的 5 分钟节流、`uploader.ts` 的配置缓存，多实例即失效。

## 7. 外部依赖与失败模式

| 依赖 | env | 未配 / 宕机 |
|---|---|---|
| Cloudinary | `CLOUDINARY_*` | 未配回落 `public/uploads/`（容器重启即丢）；宕机上传 500，发帖卡在图片步 |
| Resend | `RESEND_API_KEY` `EMAIL_FROM_ADDRESS` | dev 打 console；prod 未配 magic-link 不可用，编辑码主路径不受影响 |
| DeepSeek | `LLM_*` | scraper 该源标 failed 继续下一源；前台不受影响，只是不入新活动 |
| Embedding | `LLM_EMBED_*` | 无调用方 |
| 源站 | — | 改版是最可能的静默失效点，只在 `ScrapeRun.errorMsg` 里可见 |
| Railway | `DATABASE_URL` `NEXT_PUBLIC_SITE_URL` | 后者未设则硬编码回落到 railway 域名；`sleepApplication` 带来冷启动 |
| Actions cron | secrets `DATABASE_URL` `SCRAPER_SECRET`，var `SCRAPER_ENDPOINT` | backup 写死 pg 18 全路径；artifact 90 天；60 天无 commit 即被禁用（靠 keepalive commit） |

## 8. 不变量（改之前必须知道）

1. `GET /api/items` 的 `NOT: { category: 'housing' }`：历史 housing 行仍在表里，靠它隐藏；`utils.ts` 多处保留 housing 展示兜底。
2. `bumpedAt` = 最近活跃；只有实质性编辑（标题 / 描述 / 价格 / 图 / 类型 / 类目）、新询价、卖家回复、新申请、草稿转正会刷新；改联系方式 / 自定义标签**故意不刷新**。
3. `editCodeHash` 永不出网。当前靠每处手写 `undefined`，不是白名单，**新增返回字段极易连带泄漏**（`ipAddress` 已经泄漏了两处）。
4. `EventContactSend @@unique(eventId, fromVisitorId, toVisitorId)`：同方向一条；双向两条 = 互见。这就是整个非对称协议。
5. `Event @@unique(source, sourceUrl)`：scraper 去重基础；用户发帖用 `internal:u-<ts>-<rand>` 占位。
6. `[skip ci]` 与 `railway.json` `watchPatterns: ["**", "!.github/**"]` 互锁：Railway 不认 `[skip ci]`，改任一侧 = 每周一次无谓生产部署。
7. localStorage / cookie 键名不可改：`hb_vid` `hb_session` `hb_admin` `hb_locale` `hb_recent_views` `hb_my_contact_*` `hb_last_contact`，老用户已有数据。
8. `schema.production.prisma` 与 dev schema 手工同步；`db:push:prod --accept-data-loss` 在 preDeploy 跑，**漏同步 = 生产直接掉列**。9F 起 CI 用 `scripts/check-schema-sync.mjs` 归一化后逐行比对，不一致即红。
9. 改 OG 卡片必须 bump `shareText.ts` 的 `OG_VERSION` 和 event 页的 `OG_IMG_VERSION`（微信缓存）。
10. （Sprint 9 起）任何公开列表接口不得携带联系方式；联系方式只能经带配额的逐条接口或双向同意流程下发；序列化一律白名单；每一种需要人处理的状态必须有一条出站路径。

## 9. 雷区与技术债

- 超 400 行文件 17 个，最大：`MyPostsPanel.tsx` 1511 · `admin/page.tsx` 1329 · `MyEventsPanel.tsx` 1136 · `ListingPostModal.tsx` 856 · `EventCard.tsx` 792。AI 在这些文件里出错率最高，改动前先读整段上下文。
- 死代码：`components/PlatformSwitcher.tsx`（文件头 TODO 标删）、`scripts/migrate-housing-to-listings.ts`（废弃占位）。
- 权宜实现：event 举报用 `reason` 前缀 `[event:<id>]` 匹配（无外键）；`listingMatch.ts` v1 仅 2 维。
- `schema.prisma` 里 embedding 列注释"Postgres 上来时通过 raw SQL 加"，从未加。

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
