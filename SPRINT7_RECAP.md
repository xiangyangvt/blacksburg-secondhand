# Sprint 7 Phase 3B — 验收 RECAP

完成于 2026-05-17。

---

## 1. 砍 Reddit

- scraper 源文件删除：`src/lib/scraper/sources/reddit.ts` + `_reddit_common.ts`
- `/api/events` GET 拒绝 `category=discussion/news` + `source IN (reddit_vt, reddit_nrv)`
- 历史数据 hard delete 走 `POST /api/admin/cleanup-reddit`（部署后 Sean 调一次；GET 同 endpoint 可 dry-run 预览）
- DB 行数：待 Sean 调用后读 endpoint 返回的 `{ deleted: { events, comments, contactSends, clickThrottles } }`

---

## 2. 关键文件改动清单

**新建**（14 个文件）：
- `src/app/api/auth/magic-link/send/route.ts` + `verify/route.ts` + `logout/route.ts`
- `src/app/api/og/event/[id]/route.tsx`（edge runtime OG 卡片）
- `src/app/localnews/[eventId]/page.tsx`（Event 详情页 + metadata）
- `src/components/localnews/LiveSection.tsx`（顶部 sticky 24h 区）
- `src/components/localnews/ShareToWechatButton.tsx`（复制到微信群）
- `src/app/api/admin/cleanup-reddit/route.ts`
- 4 个 lib：`magicLink.ts` / `userSession.ts` / `eventStatus.ts` / `eventCopyText.ts`
- 加上 `MagicLinkSignInButton` / `EventDetailClient` 等配套

**改动**（9 个文件）：
- `EventCard` / `EventPostModal` / `EventCommentSection` / `MyEventsPanel`
- 3 个发布 modal（统一容器视觉）
- `/localnews/page.tsx`（接 LiveSection）
- `/api/events`（拒 Reddit + maxAttendees + 状态扩展）

**schema**：
- `Event` 加 `maxAttendees` (Int?) + 状态 enum 扩 `fulfilled / canceled / expired`
- `EventContactSend` 加 `nickname` / `note` / `revokedAt`
- 新表 `MagicLinkToken` + `UserSession`

---

## 3. 测试覆盖

- 用户**明确跳过** 3B.6 测试套件（Vitest + Playwright）
- 验收靠 `npx tsc --noEmit` / `npm run lint` / `npm run dev` SSR 实测 / curl smoke
- 所有 3B.1–3B.5 子任务在合并前都跑过 tsc + lint pass

---

## 4. User story demo（Sean 自己跑一遍）

1. 打开 `/localnews`，点右下 ➕ 发活动：标题"今晚 8 点麻将"，想找 4 人，类目「生活/娱乐」
2. 退出再以另一个 visitor 进 `/localnews`，看到这个活动（顶部 LiveSection 24h 内），点展开 → 点"发送联系方式" → 填昵称 + 微信号 + 一行话备注
3. 第一个用户回到「我的」（黑堡 tab），看到"想找 4 人 · 已 1 响应"，展开 event 看响应者列表 → 点"公开我联系方式给 ta"
4. 第二个用户在自己「我的」里看到对方联系方式
5. 第一个用户点"标记已结清"，卡片状态变 `fulfilled`，响应按钮置灰
6. 第一个用户点"复制到微信群"：粘贴目标 = `🍽️ 今晚 8 点麻将 · 想凑 4 人 · 已 1 响应 · https://...`

---

## 5. 已知边界 / 后续 backlog

- **"再发一次"**：当前是 PATCH 同 event（改 `startAt +7d`）；spec 是新建 event。已在本 sprint 内加 `forceNew` flag 实现 spec 行为
- **OG 图缓存**：`Cache-Control max-age=60`，微信预览缓存可能持续更久（微信侧）
- **LiveSection 冷启动期空**：砍 Reddit 后只剩用户发的 event，头几天可能空（预期）
- **Magic-link 邮件域名**：目前 `onboarding@resend.dev`，推荐 verify 自有域名减少 spam
- **字段重排 + 类目自动猜**：已在 EventPostModal 上落地（本 sprint 内 commit）
- **`/api/admin/cleanup-reddit`**：一次性 endpoint，下个 sprint 可清理代码
