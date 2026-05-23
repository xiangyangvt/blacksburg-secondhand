# Sprint 7 — 黑堡本地 Hub（已完工）

完工于 2026-05-17（Phase 1+2+3B）

> 本文是 SPRINT_7_PROGRESS.md + SPRINT7_RECAP.md 的合并归档。验收结论以 RECAP 为准；
> PROGRESS 进度表保留在文末作为子任务清单。

---

## 1. 砍 Reddit

- scraper 源文件删除：`src/lib/scraper/sources/reddit.ts` + `_reddit_common.ts`
- `/api/events` GET 拒绝 `category=discussion/news` + `source IN (reddit_vt, reddit_nrv)`
- 历史数据 hard delete 走 `POST /api/admin/cleanup-reddit`
- ⚠️ **截至归档（2026-05-20）该 endpoint 还没被调用过，生产仍残留 20 条 reddit_vt 数据** — 后续清理在 STATE.md 的「即时 actionable」中跟进

---

## 2. 关键文件改动清单

**新建（14 个文件）：**
- `src/app/api/auth/magic-link/send/route.ts` + `verify/route.ts` + `logout/route.ts`
- `src/app/api/og/event/[id]/route.tsx`（edge runtime OG 卡片）
- `src/app/localnews/[eventId]/page.tsx`（Event 详情页 + metadata）
- `src/components/localnews/LiveSection.tsx`（顶部 sticky 24h 区）
- `src/components/localnews/ShareToWechatButton.tsx`（复制到微信群）
- `src/app/api/admin/cleanup-reddit/route.ts`
- 4 个 lib：`magicLink.ts` / `userSession.ts` / `eventStatus.ts` / `eventCopyText.ts`
- 配套：`MagicLinkSignInButton` / `EventDetailClient` 等

**改动（9 个文件）：**
- `EventCard` / `EventPostModal` / `EventCommentSection` / `MyEventsPanel`
- 3 个发布 modal（统一容器视觉）
- `/localnews/page.tsx`（接 LiveSection）
- `/api/events`（拒 Reddit + maxAttendees + 状态扩展）

**schema：**
- `Event` 加 `maxAttendees` (Int?) + 状态 enum 扩 `fulfilled / canceled / expired`
- `EventContactSend` 加 `nickname` / `note` / `revokedAt`
- 新表 `MagicLinkToken` + `UserSession`

---

## 3. 测试覆盖

- 用户**明确跳过** 3B.6 测试套件（Vitest + Playwright）
- 验收靠 `npx tsc --noEmit` / `npm run lint` / `npm run dev` SSR 实测 / curl smoke
- 所有 3B.1–3B.5 子任务在合并前都跑过 tsc + lint pass

> ⚠️ SPRINT_7_PROGRESS.md 原文写「Vitest 42 + Playwright 13 全部通过」，与 RECAP 矛盾。
> 以 RECAP 为准：测试套件未在 Phase 3B 跑过。

---

## 4. User story（验收用例）

1. 打开 `/localnews`，右下 ➕ 发活动：「今晚 8 点麻将」，想找 4 人，类目「生活/娱乐」
2. 另一 visitor 进 `/localnews`，看到这个活动（顶部 LiveSection 24h 内），展开 → 点「发送联系方式」 → 填昵称 + 微信号 + 备注
3. 第一个用户回到「我的」（黑堡 tab），看到「想找 4 人 · 已 1 响应」，展开 event → 点「公开我联系方式给 ta」
4. 第二个用户在自己「我的」里看到对方联系方式
5. 第一个用户点「标记已结清」，卡片状态 `fulfilled`，响应按钮置灰
6. 第一个用户点「复制到微信群」：粘贴目标 = `🍽️ 今晚 8 点麻将 · 想凑 4 人 · 已 1 响应 · https://...`

---

## 5. 已知边界 / 后续 backlog

- **「再发一次」**：当前是 PATCH 同 event（改 `startAt +7d`）；spec 是新建 event。已在本 sprint 内加 `forceNew` flag 实现 spec 行为
- **OG 图缓存**：`Cache-Control max-age=60`，微信预览缓存可能持续更久（微信侧）
- **LiveSection 冷启动期空**：砍 Reddit 后只剩用户发的 event，头几天可能空（实际生产数据显示头两天有 user organic 内容补位，没塌方）
- **Magic-link 邮件域名**：目前 `onboarding@resend.dev`，推荐 verify 自有域名减少 spam
- **字段重排 + 类目自动猜**：已在 EventPostModal 上落地（本 sprint 内 commit）
- **`/api/admin/cleanup-reddit`**：一次性 endpoint，未来 sprint 可清理代码（前提是先调用过）

---

## 6. Phase 3B 进度 checklist（来自 SPRINT_7_PROGRESS.md）

### §3 数据模型
- [x] Event 表加 maxAttendees + status=fulfilled
- [x] EventContactSend 加 nickname + note
- [x] 砍 Reddit 数据 + 删 sources 文件 + 删 discussion 类目
- [x] 新建 MagicLinkToken + UserSession
- [x] schema.prisma + schema.production.prisma 同步 + migration

### §4 Event 通用化 UX
- [x] EventPostModal 极简化 + 类目自动猜
- [x] EventCard 渲染（响应数 / 倒计时 / 状态 badge）
- [x] 「发送联系方式」响应 modal
- [x] 发起人面板扩展（MyEventsPanel）
- [x] 响应者面板（MyPostsPanel）
- [x] 自动归档（lazy 或 cron）
- [x] 「复制到微信群」按钮 + emoji 字典

### §5 信息流首屏
- [x] live sticky 区 + pulse 动效 + 折叠状态

### §6 动态 OG 卡片
- [x] /api/og/event/[id] 路由（动态 / 降级）
- [x] generateMetadata for /localnews/event/[id]

### §7 Magic-link 登录
- [x] /api/auth/magic-link send + verify
- [x] Resend 集成 + 邮件模板 + .env.example
- [x] getSession 中间件（src/lib/auth.ts）
- [x] 集成到三个发布表单顶部条
- [x] localStorage hb_user_profile 统一

### §8 测试
- [ ] 单元测试（Vitest/Jest）— 跳过
- [ ] E2E（Playwright）— 跳过

---

## 7. 生产数据快照（pivot 6 天后，2026-05-20）

| 平台 | 14 天 PV | 14 天 UV |
|---|---|---|
| /          | 1,706 | 594 |
| /roommates | 721   | 229 |
| **/localnews** | **1,129** | **433** |

历史热门 Top 1: 用户自发「黑堡网球新手找搭子」44 点击 — pivot 验证成功，user-generated event 比 scraper 内容更受欢迎。
