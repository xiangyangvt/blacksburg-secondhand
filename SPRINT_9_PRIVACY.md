# Sprint 9 — 隐私分级与可观测性 · 执行 Spec（2026-09-16）

> 交给 AI agent 在分支上执行，PR 收口。每个子项独立分支、独立 PR，按编号顺序合入。
> 开工前读 `CLAUDE.md`、`STATE.md`、`ARCHITECTURE.md`。落点是按代码现状判断的，动手前用代码确认；不符则按目标行为定位并在 PR 里说明。
> **范围外**：搜索改造、admin 拆分、legal 页面之外的任何 UI 重构。不做顺手改。

## 风险分级（本 sprint 各项）

| 子项 | 风险级 | 门禁要求 |
|---|---|---|
| 9A 联系方式逐条披露 + 配额 | 2 | typecheck/lint/build/vitest + AI 对照本 spec 自检 + 跨厂互审 |
| 9B 隐私政策 / 服务条款 / 发布提示 | 1 | typecheck/lint/build + 390px 目检 |
| 9C 限流抽共用模块 | 2 | 同 9A |
| 9D 维护事件出站通知 | 1 | typecheck/lint/build + 手动触发一次验证 |
| 9E admin 会话凭据加固 | 2 | 同 9A |
| 9F 测试进入 CI 门禁 | 1 | CI 自证（红 → 绿） |

---

## 9A. 卖家联系方式：列表不带、逐条取、有配额

### 现象
- `GET /api/items`（列表）和 `/item/[id]` 的 SSR 直接返回每个 item 的 `contactValue`。一次匿名请求可导出全部在售卖家的微信号 / 手机号。C10 直显时拆掉了 reveal 门，注释里承诺的"服务端限流补救"没有做。
- `GET /api/items/by-contact?value=` 公开、无限流、按联系方式反查一个人全部帖子，limit 上限 200。
- `POST /api/items/[id]/reveal-contact` 存在但无任何限流，任何人可逐条调用。
- **代码地图补充发现（2026-09-16 勘察）**：
  - `GET /api/events` 与 `/localnews/event/[id]` SSR 无条件返回 `posterContact`；`posterContactPublic` 只是前端开关，服务端没有实现。
  - `GET /api/listings/by-contact?value=` 的 serialize 未擦 `contactValue` / `ipAddress`；`GET /api/items/by-contact` 的 spread 连带返回 `ipAddress` / `utmSource`。
  - `GET /api/my/events?contact=` 用明文联系方式反查 visitorId，无二次凭证，知道某人微信号即可读其收到的联系方式列表，且有"标记已读"副作用。
  - 各 `*/verify-code` 路由文件注释写了"5 次/IP/分钟"，代码里没有任何限流，编辑密码可被暴力尝试。

### 目标（产品体验不变，批量成本改变）
1. **列表接口不再携带卖家联系方式**。`GET /api/items` 返回 `contactValue: ''`、`customContactLabel: null`（与 inquiries 已有的脱敏方式一致）。`contactType` 可以保留（"微信 / 手机"这个类型不敏感，前端展开前可先渲染标签）。
2. **`/item/[id]` 页面同样不在 SSR 里下发联系方式**，由客户端展开后取。
3. **展开即见的体验保留**：`ItemCard` 展开态 / `ItemDetailView` 挂载时，客户端调用一次 `POST reveal-contact`，拿到后渲染与现在完全相同的「微信: xxx + 复制」UI。同一卡片同一会话只取一次（组件状态缓存）。取回前显示轻量占位（骨架或「加载中」），失败或超配额时显示接口返回的提示文案。
4. **`reveal-contact` 加配额**，规则：
   - 身份键：`hb_vid` cookie（沿用 `view` 接口的 visitor 机制，无则下发）+ 客户端 IP（`x-forwarded-for` 首段，Railway 反代）。
   - 配额：同 visitor **30 次 / 小时、120 次 / 天**；同 IP **60 次 / 小时**（多人共用校园 NAT 时给余量）。任一超限返回 `429`，body 含中英文提示（i18n 键新增）。
   - 同一 visitor 对同一 item 的重复 reveal **不计数**（刷新页面不消耗配额）。
   - UA 含 bot/crawler/spider/headless 直接 `403`（沿用 `view` 的判断，抽成共用函数，见 9C）。
   - 计数存 **数据库**，不用进程内存：Railway 开了 `sleepApplication`，进程会被回收；未来多实例也不共享内存。新增 Prisma 模型（示例名 `RevealThrottle`：`id, itemId, visitorId, ip, createdAt`，索引 `(visitorId, createdAt)`、`(ip, createdAt)`），**两份 schema 都要加**（`schema.prisma` 与 `schema.production.prisma`），并确认 `db:push:prod` 会建表。
   - 过期行清理：接口内按概率（如 1%）删除 2 天前的行，或复用现有 cron；二选一写进 PR。
5. **`by-contact` GET**：
   - 响应中的每个 item 同样脱敏 `contactValue`（调用方已经知道这个联系方式，不需要回传）。
   - 调用计入同一配额（一次调用 = 一次 reveal）。
   - `limit` 上限从 200 降到 30（现有唯一调用方 `ItemCard` 传的就是 30）。
6. **留言人联系方式**保持现状（已走 `inquiries/[id]/reveal-contact`），但同样纳入配额计数（同一张表，`itemId` 换成 `inquiryId` 或加 `kind` 字段）。
7. **活动平台**：`GET /api/events` 与 event SSR 页在服务端按 `posterContactPublic` 决定是否下发 `posterContact`；非公开时置空，响应者通过既有 `reveal-to-responder` 流程获得。前端逻辑不变，只是把开关从客户端挪到服务端。
8. **序列化改白名单**：`items/by-contact`、`listings/by-contact` 的 GET 响应改为显式 `select` 白名单（对齐 `events/[id]/og-data` 的做法），`ipAddress` / `utmSource` / `editCodeHash` 永不出网。`listings/by-contact` GET 同样脱敏 `contactValue`。
9. **`GET /api/my/events?contact=`**：去掉纯 contact 反查分支，或要求同时带 `posterCode` 校验（二选一，PR 说明理由）。`hb_vid` 路径不变。
10. **`*/verify-code`**（items / listings / events 三处）加失败限流：同 IP 10 次 / 15 分钟，走 9C 模块。
11. **不变量登记**：在 `ARCHITECTURE.md`「不变量」一节新增：*任何公开列表接口不得携带联系方式；联系方式只能经带配额的逐条接口或双向同意流程下发；序列化一律白名单。*

### 不做
- 室友平台（已是申请-同意双向解锁）、活动平台（已是 reveal-to-responder）不动。
- 不加验证码 / Turnstile。超配额直接 429，先观察日志再决定。
- 不改 `contactRevealCount` 之类已废弃字段。

### 验收
- [ ] `curl /api/items` 响应中 `contactValue` 全为空字符串；`/item/[id]` 的 HTML 源码里不出现任何卖家微信号 / 手机号（用 fixture 帖验证）。
- [ ] 390px 目检：展开任一在售帖，联系方式与复制按钮出现，视觉与改动前一致；刷新后再展开不报 429。
- [ ] 脚本连续调用 `reveal-contact` 31 次（不同 item，同 cookie）：第 31 次 429，body 有中英文提示；清 cookie 换 IP 后恢复。
- [ ] 同 visitor 同 item 重复调用 50 次不触发 429。
- [ ] `by-contact` 响应 `contactValue` 为空，`limit=200` 被截到 30；items / listings 两处响应 JSON 中不存在 `ipAddress`、`utmSource`、`editCodeHash` 键。
- [ ] 建一个 `posterContactPublic=false` 的 fixture 活动：`curl /api/events` 与 event 页 HTML 源码里不出现其联系方式；发布者走 reveal-to-responder 后响应者能看到。
- [ ] `GET /api/my/events?contact=<别人微信号>` 不再返回其 received 列表。
- [ ] 脚本对 `verify-code` 连错 11 次，第 11 次 429。
- [ ] vitest：配额判定逻辑（窗口、去重、UA 拦截）有单测，用内存 Prisma mock 或纯函数抽出后测。
- [ ] CI 三件套绿；`npx prisma validate` 两份 schema 都过。
- [ ] PR 描述逐项对照本节打勾，每项附证据（curl 输出 / 截图 / 测试计数），纯打勾不算。
- [ ] PR 正文不含本机路径。

---

## 9B. 隐私政策、服务条款、发布时可见性提示

### 现象
无 `/privacy`、`/terms`；发布表单没有告知联系方式将对访客可见。用户同意的范围在法律上是空白。

### 目标
1. 新增 `/privacy` 与 `/terms` 两个静态页（中英双语，沿用 i18n 机制），Footer 加链接。内容要点（**不是法律文书，是清楚的告知**）：
   - 收集什么：你主动填写的联系方式、发布内容、编辑密码（哈希存储）、访问日志（IP、UA，用于反滥用与统计）。
   - 谁能看到：联系方式对本站访客逐条可见，本站不向第三方出售；留言人联系方式仅发布者可见；室友 / 活动平台按双向同意披露。
   - 禁止行为：批量采集、自动化抓取联系方式、骚扰。违者封禁并保留追究权利。
   - 删除渠道：在「我的」里自行删除；或邮件到站长邮箱（写真实 gmail，Sean 已允许公开）。
   - 数据保留：帖子下架后保留期；备份周期与保留期（参考 `RESTORE.md`）。
   - 开源声明与仓库链接。
2. **发布表单**（二手 / 室友 / 活动三处）联系方式字段下方加一行灰字：「你的联系方式将对本站访客可见 · 隐私政策」，链接到 `/privacy`。不加勾选框（Reactance 规避，见 `docs/archive/UX_BATCH.md` 元规则）。
3. `robots.txt` 保持；`sitemap` 加入两个新页。
4. STATE backlog 的 B1–B5 中，本项覆盖 privacy / terms / footer；`/about` 与 `/report-abuse` 不在本次。

### 验收
- [ ] 两页 390px 可读，中英切换正常，Footer 链接可达。
- [ ] 三个发布表单都有提示行且链接正确。
- [ ] 文案里的邮箱、仓库链接为真实值。
- [ ] CI 三件套绿。

---

## 9C. 限流抽成共用模块

### 现象
限流 / 节流散在 5 个 route 里各自内联（`items/[id]/view`、`listings/[id]/view`、`events/[id]/click`、`events/[id]/comments`、`admin/cleanup-reddit`），visitor cookie 逻辑和 bot UA 判断重复实现。9A 又会新增一处。

### 目标
1. 新建 `src/lib/rateLimit.ts`，导出：
   - `getVisitorId(req)` / `setVisitorCookie(res, id)`：统一 `hb_vid`。
   - `isBotUA(req)`。
   - `checkQuota({ key, window, max })`：数据库计数，返回 `{ ok, remaining, retryAfter }`。
2. 9A 的 reveal 配额建立在此模块上（9A 先合，9C 把 9A 的内联实现迁到模块，或 9A 直接以此模块起步；二选一，PR 说明）。
3. 现有 5 处**行为不变**地迁到共用函数。不改任何阈值。
4. `ARCHITECTURE.md` 模块清单登记该模块为"反滥用"唯一入口。

### 验收
- [ ] 5 处 route 的 diff 只有"内联 → 调用模块"，阈值与语义不变（PR 逐处列出原阈值）。
- [ ] `rateLimit.ts` 单测覆盖窗口边界与去重。
- [ ] CI 绿；390px 抽查 view 计数与活动 click 仍正常。

---

## 9D. 维护事件出站通知

### 现象
后台 `/admin` 只有被动查看，没有任何主动通知。举报队列、scraper 连续失败、备份未跑都要登录才知道。

### 目标
1. 新增鉴权接口 `GET /api/admin/digest`（admin cookie 或 `ADMIN_PASSWORD` bearer），返回结构化摘要：举报队列数、隐藏队列数、scraper 最近 N 次失败数与最后成功时间、最近备份时间（读 `.github/last-backup.txt` 或 artifact 时间）、9A 上线后的 429 触发次数。
2. GitHub Actions 新增每日 cron（复用现有 workflow 结构），调该接口；**任一指标越过阈值**才通过 Resend 发邮件到站长 gmail，正常日不发（避免通知疲劳）。阈值写在 workflow env 里可调。
3. 邮件正文一屏内，每条附后台入口链接。
4. 预留：摘要接口的 JSON 形状与注意力账本的 `needs-you` 事件对齐（`kind`、`ref`），未来可直接写板。

### 验收
- [ ] `workflow_dispatch` 手动触发一次，在阈值下不发邮件；临时把阈值调到 0 触发一封，收到并格式正确。
- [ ] 接口未鉴权返回 401。
- [ ] `ARCHITECTURE.md`「不变量」新增：*每一种需要人处理的状态都必须有一条出站路径。*

---

## 9E. admin 会话凭据加固

### 现象
`src/lib/adminAuth.ts`：登录后下发的 `hb_admin` cookie 的值**就是明文 `ADMIN_PASSWORD`**，`isAdmin()` 用 `===` 直接比对。后果：
- 任何拿到 cookie 的途径（共用设备、浏览器扩展、日后一处 XSS）等于拿到密码本身，且密码轮换前无法失效单个会话。
- 字符串比较非常量时间，理论上可被时序侧信道探测（低风险，顺手修）。
- 代码开源后这个实现对任何人可见；开源本身不是问题，弱实现才是。

### 目标
1. cookie 改为 **HMAC 签名的会话令牌**：`base64(payload).signature`，payload 含签发时间与随机 nonce，密钥用 `ADMIN_PASSWORD` 派生（或新增 `ADMIN_SESSION_SECRET`，`.env.example` 同步）。cookie 中不再出现密码。
2. 登录比对与签名校验都用 `crypto.timingSafeEqual`。
3. 登录接口加失败限流：同 IP 5 次 / 15 分钟，走 9C 的共用模块。
4. `isAdmin()` 的调用方（admin 页面与 `api/admin/*`）行为不变。

### 不做
- 不引入多管理员、不加 2FA、不改 30 天有效期。

### 验收
- [ ] 登录后浏览器里的 `hb_admin` 值不含密码；篡改一个字符后请求 `/admin` 被拒。
- [ ] 错密码连续 6 次，第 6 次 429。
- [ ] 旧 cookie（明文密码格式）在新版本下失效，需重新登录一次（PR 里注明这个一次性影响）。
- [ ] CI 绿；`api/admin/cleanup-reddit` 用新 cookie 仍可调。

---

## 9F. 测试进入 CI 门禁

### 现象
`ci.yml` 只跑 typecheck / lint / build，从不执行 `npm test`，`e2e/smoke.spec.ts` 也不在任何 CI 里。测试存在但不是门禁；9A / 9C / 9E 新增的单测如果不进 CI 等于没写。

### 目标
1. `ci.yml` 的 build job 在 lint 之后加 `npm test`（vitest run）。
2. 新增 e2e job：安装 playwright chromium，起 `next start` 跑 `e2e/smoke.spec.ts`。用 SQLite CI 库 + seed。**允许先只跑 smoke**，时长控制在 5 分钟内；超时就拆成单独 workflow 只在 PR 上跑。
3. 两份 schema 一致性检查：一个脚本剥掉注释和 provider / binaryTargets 后 diff，不一致即 fail（雷区第 8 条）。

### 验收
- [ ] 故意让一个单测失败，PR 的 CI 变红；修回后变绿。
- [ ] e2e job 在 PR 上可见且绿。
- [ ] 手工在 dev schema 加一个字段不同步 production，CI 红。

---

## 执行顺序
9C（模块）→ 9A（披露面，风险最高）→ 9E（admin）→ 9F（门禁）→ 9B（法律页）→ 9D（通知）。9C 先行是因为 9A / 9E 都依赖它；9F 尽早，让后面的 PR 受益。

---

## 整批约定
- 每个 PR 描述以本 spec 对应小节的验收清单为骨架，逐项附证据。
- 与 spec 的偏差（落点修正、方案二选一的选择）写在 PR 顶部"偏差"段。
- 合并后由 Sean 打 tag 视为拍板；未打 tag 的合并视为未验收。
