# 黑堡社区站 — 项目状态

> 单一可信源：当前在哪、未来慢慢优化什么、文档去哪找。
> 上次更新：2026-09-18

---

## 当前状态

**Sprint 10 混合搜索与渐进式 AI 助手已完工并上线（2026-09-18，tag `v2026.09.18-sprint10`）。** `SEARCH_AI_ENABLED=true`，三个站的第 1 层语义匹配与二手站的第 2 层对话在生产上运行。当前无进行中的 sprint。

**Sprint 11「从网站到微信群」代码已全部合入 main（2026-09-18），尚未部署验证。** 规格与偏差见 `SPRINT_11_SHARE.md`，取舍见 `docs/decisions/0001-smooth-first-detect-abuse.md`。
- 合入：#25 统一问询栏 + 用户反馈 · #26 卖家摊位 `/s/<slug>` + 相似延伸 · #30 一键长图（复制图片 / 下载）· #31 搜索栏渐变环与放大镜图标 · #32 「已复制」圆章钉在屏幕正中 · #27 异常侦测（重级发邮件并自动暂停该访客查看联系方式 24 小时）。
- 上线待办（Sprint 11，1 / 3 / 5 已验证，见下）：
  1. 部署时 `db push` 会新建 `Feedback`、`Shelf` 两张表；无必配 env。可选 `ALERT_EMAIL_TO`（不配则用 `DIGEST_EMAIL_TO`）、`ABUSE_AUTO_BLOCK=false`（退回只通知）、`ABUSE_*` 阈值。
  2. 在「我的 → 在售」点「一键生成长图」：确认能出图（Railway 出站取 Google Fonts；取不到会 503 而不是出乱码图）。
  3. 打开任一 `/api/items/similar?shelf=<slug>`，看 `mode` 是不是 `vector`（`PgVectorStore.nearestToRows` 的 SQL 没在真 Postgres 上跑过；`category` = 走了同类目兜底）。
  4. 真机、微信内置浏览器里试：「复制图片」「下载图片」是否可用；一张 10 件的长图发到群里是否被压糊（调 `lib/poster.ts` 的 `POSTER_PAGE_SIZE`）。
  5. 搜索栏里问一句站务问题（如「怎么删帖」），确认出的是「转给站长」卡片而不是 AI 自己作答；提交一条，到 `/admin`「用户反馈」能看到。
- 上线验证（2026-09-18，对生产只读探测 + 一次问答 + 一条标注为测试的反馈）：新路由都在；`/api/items/similar` 的 `mode=vector`（`nearestToRows` 的 SQL 在真 pgvector 上可用）；站务问题 → `intent=ask_ops` 固定文案无卡片，找物问题正常出卡片；`POST /api/feedback` 入库成功（`Feedback` 表已建）。**还没验证**：长图在生产出图（要卖家本人的编辑码才能建摊位）、微信真机里的复制 / 下载与压缩效果。
- 追加：搜索框按联系方式**精确**搜某卖家（11F）。只认整串相等，走披露配额与异常侦测；9A 去掉的子串匹配仍然不做。

上线记录（2026-09-18）：
- 探针：`backend=pgvector`，vector 扩展 0.8.6，三张表的 HNSW 索引都在（`CREATE INDEX CONCURRENTLY` 经 Prisma 可执行）。
- 回填：118 条（二手 73 / 室友 19 / 活动 26），4 次 API 调用，5.6 秒，0 失败。
- 真 key 验证：跨语言通过（`desk` → 「桌子」「带插座书桌」，`something to sit on` → 各种椅子；室友 `sublet near campus`、活动 `hiking this weekend` 均命中）；对话 3 条均 200、2–3.5 秒，预算约束与多轮上下文生效，索要卖家微信被拒且不给卡片；预算的事务 + 咨询锁路径在 Postgres 上可用；三站响应无私密字段。
- 据实测调了两处默认值：语义阈值 0.35 → 0.40（0.35–0.40 基本是噪音）；英文一句话上限 60 → 140 字符（60 会截断半句）。
- #19 复核：`/api/listings` 的留言不再带 `ipAddress` / `utmSource`。

还没做 / 留意：
- 10 次真实问答的费用汇总没单独做；`/admin` 的「AI 费用」小节可随时看。模型偶尔会在英文回答里复述价格（prompt 要求不复述；价格来自候选数据、卡片上也有，暂不处理）。
- Railway 上建议配 `ADMIN_SESSION_SECRET`（`openssl rand -base64 32`；配完需重新登录后台）。
- 回退：`SEARCH_AI_ENABLED=false` 重新部署即回到纯关键词搜索；第 2 层入口的收紧方法见 `SemanticResults.tsx` 的 `showChat` 注释。

2026-07 维护记录：backup workflow 加 keepalive commit 防 60 天自动禁用（#1）、pg client 升 18 修复每周 dump 失败（#2/#3）、Railway 开 serverless 休眠控成本（#4）。

生产数据快照（pivot 6 天后，2026-05-20 抓的）：

| 平台 | 14 天 PV | 14 天 UV | 当前活跃 |
|---|---|---|---|
| `/` 二手 | 1,706 | 594 | 60 商品 |
| `/roommates` | 721 | 229 | 7 listing / 5 申请 |
| `/localnews` | **1,129** | **433** | 67 events |

**关键发现**：用户自发 event「黑堡网球新手找搭子」44 点击 / 「极限飞盘」23 点击，比任何 scraper 抓的活动都更受欢迎。pivot 成功验证 — 门户 PMF 在「找队友」而不是「列活动」。

---

## 三平台

- `/` 二手买卖
- `/roommates` 室友 & 转租
- `/localnews` 本地信息流 + 活动（含响应 / Magic-link / OG / LiveSection）

## 技术栈（已锁定）

Next.js 14 · Prisma + SQLite(dev)/Postgres(prod) · Cloudinary · Resend · DeepSeek V4 · Vitest · Playwright

---

## 即时 actionable（小事，方便时做）

- [ ] 调用 `/api/admin/cleanup-reddit`（dry-run GET → POST 真删，清理 reddit_vt 20 条残留）
- [ ] 微信群分享链接补 `?utm_source=wx`，恢复归因（当前近 30 天 65 条发布全部 utm_source=null）

---

## 未来慢慢优化的 backlog

> 没有固定顺序，按当下心情和数据驱动来挑。Sprint 7 之后项目进入「维护 + 慢慢优化」阶段。

### A. 留存 / 粘性

来自 Sprint 7 数据洞察 + 原 BLACKSBURG_HUB_PLAN Phase 2/3 backlog。

- 多源 event 去重（hash + 标题相似度）
- （S10 已做语义搜索与找物对话；剩余想法：室友 / 活动站的对话、RRF 融合进第 0 层、查询改写）
- 提醒 / 订阅机制（用户关注 category 或 keyword → magic-link 推送）

### B. SEO 与运营

来自原 BLACKSBURG_HUB_PLAN Phase 4 + PROFESSIONAL_PLAN B6。

- JSON-LD（Item=Product+Offer / Event=Event / Site=Organization）
- sitemap 完善 + canonical URL 审计
- 过期 event / listing / item 清理 cron

### C. 工程地基

来自 PROFESSIONAL_PLAN Batch A 未完成项（详见 `docs/archive/PROFESSIONAL_PLAN.md`）。

- A3 Sentry 错误监控 + PII 严格脱敏
- A1+A2 Zod schema 抽出 + 5 路径校验
- A7+A8 拆 `admin/page.tsx` (1330 行) + `ListingPostModal`
- A4 补单测：`batchParser` / `itemValidation` / `listingValidation` / `utm` / `recentViews`

### D. 社区开源 / 法律

来自 PROFESSIONAL_PLAN Batch B+D 未完成项。

- B1–B5 法律页四件套（`/about` `/terms` `/privacy` `/report-abuse` + Footer 整理）
- D1 `CONTRIBUTING.md` + `SECURITY.md` + Issue / PR 模板
- D2 README screenshots
- D3 README「fork 给其他学校用」专章

---

## 已完成 sprint 概览

| Sprint | 主题 | 归档文档 |
|---|---|---|
| S0 | MVP（Phase 0–5） | `docs/archive/PLAN.md` |
| S1–S2 | 升级 | `docs/archive/UPGRADE_PLAN.md` |
| S4 | 室友 & 转租 | `docs/archive/ROOMMATES_PLAN.md` |
| S5 | 专业化（部分完成） | `docs/archive/PROFESSIONAL_PLAN.md` |
| S6 | UX 精修 | `docs/archive/UX_BATCH.md` |
| S7 Phase 1+2+3B | 本地 Hub | `docs/archive/BLACKSBURG_HUB_PLAN.md` + `docs/archive/SPRINT_7_DONE.md` |
| S8 | RESALE UX 微优化（8 项）+ backup keepalive | `docs/archive/SPRINT_8_UX_POLISH.md` |
| S9 | 隐私分级与可观测性（限流模块 / 披露面 / admin 会话 / CI 门禁 / 法律页 / 维护摘要） | `docs/archive/SPRINT_9_PRIVACY.md` |
| S10 | 混合搜索与渐进式 AI 助手（pgvector 向量存储 / 三站语义匹配 / 二手站对话 / AI 费用护栏与面板） | `docs/archive/SPRINT_10_SEARCH.md` |

---

## 文档地图

- **活文档**（根目录）：`README` · `DEPLOY` · `RESTORE` · **`STATE`**（本文件）
- **历史 sprint plan**：`docs/archive/`
- **当前 sprint plan**：无（下一个 sprint 的 spec 放根目录）
- **架构地图**：`ARCHITECTURE.md`（根目录，改动触及其任一节的 PR 必须同步）

---

## 用户 / 产品基础事实

- 服务对象：黑堡（Virginia Tech 所在地）本地华人 / 学生社区
- 无登录，每条 post 用「识别码」（bcrypt 哈希）；Magic-link 邮件登录做轻量身份连续性
- 反垃圾：三 IP 自动隐藏 + 隐式 IP 限速 + 举报按钮（截至 2026-05-20 举报队列 + 隐藏队列全 0）
- 推广渠道：黑堡本地华人微信群
