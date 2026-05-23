# 黑堡社区站 — 项目状态

> 单一可信源：当前在哪、未来慢慢优化什么、文档去哪找。
> 上次更新：2026-05-21

---

## 当前状态

**Sprint 7 Phase 3B 已完工（2026-05-17）。** 无活跃 sprint。

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
- 全文搜索（PG `tsvector` 或 `pg_trgm` + 中文分词 `zhparser`）
- pgvector + RAG chatbot（DeepSeek V4 Pro + Vercel AI SDK）
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

---

## 文档地图

- **活文档**（根目录）：`README` · `DEPLOY` · `RESTORE` · **`STATE`**（本文件）
- **历史 sprint plan**：`docs/archive/`
- **当前 sprint plan**：暂无（下一个 sprint 启动时在根目录新建 `SPRINT_8_*.md`）

---

## 用户 / 产品基础事实

- 服务对象：黑堡（Virginia Tech 所在地）本地华人 / 学生社区
- 无登录，每条 post 用「识别码」（bcrypt 哈希）；Magic-link 邮件登录做轻量身份连续性
- 反垃圾：三 IP 自动隐藏 + 隐式 IP 限速 + 举报按钮（截至 2026-05-20 举报队列 + 隐藏队列全 0）
- 推广渠道：黑堡本地华人微信群
