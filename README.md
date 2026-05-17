# 黑堡二手买卖 · Blacksburg Secondhand

> 给黑堡（Blacksburg, VA）本地华人/学生社区做的开源**社区站**。
> 二手买卖 · 室友与转租 · 本地活动信息流。
> 完全免登录、零运营成本可跑、所有代码 MIT 开源。

**线上地址**：https://blacksburg-secondhand-production.up.railway.app
**开源协议**：MIT
**反馈**：欢迎在 [Issues](../../issues) 提 bug 或建议，欢迎 [Pull Request](../../pulls)

---

## 三平台

| 路径 | 平台 | 用途 |
|---|---|---|
| `/` | 二手买卖 | 物品 / 求购，扁平展示 + 一键复制 + 折叠式询价 |
| `/roommates` | 室友 & 转租 | A/B/C/D 四种 listing（招室友 / 找室友 / 转租 / 求转租），申请-同意双向解锁联系方式 |
| `/localnews` | 黑堡本地 | 用户发活动 / 求助 + scraper 自动抓 hokiesports 等 + 顶部 Live 24h 区 |

---

## 中文说明

### 核心交互理念

- **完全免登录**：每帖一个「密码」做修改 / 删除 / 管理凭证（≥6 位，丢了无法找回）
  - 之前叫「识别码」，Sprint 7 起统一改名「密码」
  - 配合留下的「联系方式」一起作为身份凭证：要在「我的」里看到自己的帖子，需要 联系方式 + 密码 双匹配
- **（可选）邮箱登录**：配 Resend 后启用 magic-link 邮箱登录，自动预填联系方式 / 回看自己的发帖
  - 不配也完全能跑，密码方案仍是主流入口
- **扁平化展示**：所有信息（图、价格、联系方式）一屏全开，不用点详情页（黑堡活动除外，单独详情页是为了微信分享 OG 卡片）
- **一键复制**：联系方式、「标题 + 价格」、黑堡活动「复制到微信群」都一键复制
- **社区议价 / 互动**：每帖下可折叠展开询价 / 评论，用自己的联系方式作身份
- **响应式 + PWA**：手机 / 电脑同一 URL；手机右下角浮动「➕」；手机浏览器可「添加到主屏幕」当 App 用
- **代码层 i18n 基础设施**：`messages.ts` 中英文案齐全；目前默认中文

### Sprint 7 Phase 3B 新功能（2026-05）

- **活动通用化**：发活动 / 求助互助走统一 `Event` 模型
  - 可填「想凑 N 人」(`maxAttendees`)
  - 状态机：`active` / `fulfilled`（已结清） / `canceled` / `expired`
  - 卡片上实时显「已 N 响应」+ 倒计时（距开始 / 距过期）
- **联系方式 asymmetric 交换**：
  - 响应者点「发送联系方式」→ 填昵称 + 微信号 + 一行话备注
  - 发布者在「我的」里看响应列表 → 点「公开我联系方式给 ta」才双向解锁
  - 响应者可随时撤回响应
- **LiveSection**：`/localnews` 顶部 sticky 24h 内活动条，开屏第一眼就看到「今晚 8 点麻将」这类即时局
- **动态 OG 卡片**：`/api/og/event/[id]` edge runtime 生成微信分享预览图（带活动 emoji / 标题 / 状态 / 倒计时）
- **Event 详情页 + 复制到微信群**：`/localnews/[eventId]` + 一键复制「🍽️ 今晚 8 点麻将 · 想凑 4 人 · 已 1 响应 · https://...」到剪贴板
- **Magic-link 邮箱登录**：Resend 发送一次性登录链接（配 `RESEND_API_KEY` 启用，可选）

### 本地开发

```bash
# 1. 复制环境变量模板（Cloudinary / Resend / LLM 都不填也能跑核心功能）
cp .env.example .env

# 2. 安装依赖
npm install

# 3. 初始化 SQLite 数据库
npm run db:migrate

# 4. （可选）插入示例数据
npm run db:seed

# 5. 启动开发服务器
npm run dev
```

打开 http://localhost:3000 即可。

### 图片存储

- **不配置**（默认）：上传图片落到 `public/uploads/`，仅供本地测试
- **配置 Cloudinary**：在 `.env` 填 `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`，重启 dev server 后所有上传自动走 Cloudinary CDN
- 浏览器访问 `/api/upload` 可看到当前用的是哪种

### 数据库

- **本地**：默认 SQLite（`prisma/schema.prisma`）
- **生产**：PostgreSQL（`prisma/schema.production.prisma`）
- Railway 部署时使用 `npm run build:prod`，自动切换到 Postgres schema
- Sprint 7 新表：`Event` / `EventComment` / `EventContactSend` / `EventClickThrottle` / `MagicLinkToken` / `UserSession`

### 环境变量

完整列表见 `.env.example`，核心几个：

- `DATABASE_URL` — 本地 SQLite / 生产 Postgres（Railway 自动注入）
- `CLOUDINARY_*` — 图片云存储（不配回落本地）
- `ADMIN_PASSWORD` — `/admin` 后台入口密码
- `SCRAPER_SECRET` — GitHub Action 触发 scraper 鉴权
- `LLM_*` — DeepSeek（HTML 提取 + 中文摘要翻译）
- `NEXT_PUBLIC_SITE_URL` — 站点公开 URL（magic-link 邮件 + OG 卡片用）
- `RESEND_API_KEY` — Resend 邮件 API key（magic-link 可选）
- `EMAIL_FROM_ADDRESS` — 默认 `onboarding@resend.dev`

### 使用说明

- **发物品 / 室友 / 活动**：点右下角浮动「➕」，填写信息，**记住密码**
- **修改 / 删除**：在「我的」里输入联系方式 + 密码，进去后管理自己的帖子
- **议价 / 评论**：点帖下方的「N 条询价 / 评论」展开，留言用自己的联系方式作身份
- **活动响应**：在 `/localnews` 点活动 → 「发送联系方式」→ 等发布者确认双向解锁

### 部署

Railway 监听 main 自动部署。详见 [`DEPLOY.md`](./DEPLOY.md)。

---

## English

A simple, mobile-first, login-free community site built for the
Chinese-speaking community in Blacksburg, Virginia (Virginia Tech area).
Three sub-sites: secondhand marketplace, roommates & sublet, and local events.

### Features

- **No accounts** — set a "password" per post to make changes later (or optionally log in via Resend magic-link)
- **Contact + password = identity** — to see your own posts under "My Posts", we match both fields
- **Flat layout** — all info visible without a detail page (events have detail pages for WeChat share previews)
- **One-tap copy** — copy contact, "title + price", or a full event card to paste in WeChat groups
- **Event protocol** — asymmetric contact exchange: responders send their info; the host approves to unlock theirs
- **Dynamic OG cards** — share an event link to WeChat and see a generated preview with emoji / title / status / countdown
- **Open source** — issues and PRs welcome

### Local Development

```bash
npm install
npm run db:migrate
npm run db:seed   # optional: load demo data
npm run dev
```

Open http://localhost:3000.

### Tech Stack

Next.js 14 (App Router) · TypeScript · Prisma · SQLite (dev) / PostgreSQL (prod) · Tailwind CSS · Cloudinary (images) · Resend (optional magic-link) · DeepSeek (LLM for scraper).

### Deploy

Railway watches `main`. See [`DEPLOY.md`](./DEPLOY.md).

### License

MIT — see [LICENSE](LICENSE).

---

## 禁止内容 / Prohibited

枪支、弹药、毒品、活体动物、违法物品、虚假信息、广告灌水。
违者举报后将被隐藏。Site admin 保留删除任何内容的权利。
