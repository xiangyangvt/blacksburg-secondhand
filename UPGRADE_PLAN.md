# 黑堡二手买卖 — 升级规划（Upgrade Plan）

> 创建：2026-05-11
> 状态：规划中（待 Sean 确认本轮范围后开始第 1 批）
> 关联文档：[PLAN.md](./PLAN.md)（原始项目计划与设计决策）

---

## 一、本轮升级背景

PLAN.md 描述的 Phase 0~5 已全部跑通：Next.js 14 + Prisma + Tailwind 跑在 Railway，
SQLite/PG 双 schema 切换、Cloudinary 上传、识别码体系、卖家回复询价、
中英 i18n 框架（暂不展示切换按钮）、自动隐藏举报、`/admin` 后台都已上线。

这一轮目标：在 **不破坏现有 UX 哲学**（无登录、扁平化、低摩擦）的前提下，
强化「地基稳健性 + 用户感知体验 + 社区传播能力」。

Sean 选择的覆盖方向（来自规划对齐）：
- **A** 体验/性能
- **B** 搜索/发现
- **C** 通知/互动
- **E** 代码质量
- **G** 新功能/玩法
- **R** 已知风险点修复（3 条：双 schema 切换、photoUrls 字符串存储、举报+图床清理）

---

## 二、当前架构盘点（事实陈述，便于对齐）

### 2.1 数据层
- 双 schema：`prisma/schema.prisma`（SQLite）+ `prisma/schema.production.prisma`（PostgreSQL）
- `db:use-postgres` 脚本会 `cp` 覆盖 `schema.prisma` ⚠️ **本地误跑会改写默认 schema**
- 3 张表：`Item` / `Inquiry` / `Report`
- `photoUrls` 存的是 JSON 字符串（SQLite 兼容，PG 上其实可以原生数组）
- `Inquiry` 已超出 PLAN：加了 `sellerReply` / `sellerRepliedAt`
- `bumpedAt` 字段已有但**没有任何代码在写它**

### 2.2 API 层（6 条路由）
| 路由 | 方法 | 备注 |
|---|---|---|
| `/api/items` | GET, POST | 列表（`take: 200`）+ 创建 |
| `/api/items/[id]` | PATCH, DELETE | 编辑/软删（带识别码 bcrypt 校验） |
| `/api/items/[id]/inquiries` | POST | 创建询价 |
| `/api/inquiries/[id]` | PATCH, DELETE | 卖家回复 / 买家自改 / 卖家清理 |
| `/api/reports` | POST | 举报（item 触发 3-IP 自动隐藏，inquiry 分支未实现） |
| `/api/upload` | POST, GET | 智能上传（Cloudinary / 本地 fallback） |

所有路由校验都是手写 `if-else`，未使用 zod 等校验库。

### 2.3 前端组成
- `page.tsx` (285) — Client component，所有 fetch / filter / modal 状态
- `ItemCard` (325)、`InquirySection` (357)、`PostModal` (314) — 三个超过 300 行的核心组件
- `FilterSidebar` (137)、`MobileFilterToggle` (87) — 桌面/手机双套筛选 UI
- `FabPostButton`、`ScrollToTop`、`CopyButton`、`Dropdown`、`EditCodePrompt`、`ImageUpload`
- **`<img>` 全部是原生标签**（未用 `next/image`）
- 客户端图片预压缩已实现（≥500KB 自动压到 maxDim 1600 / quality 0.85）

### 2.4 国际化
- 字典完整（zh/en），所有文案走 `useT()`
- 顶栏切换按钮已撤；恢复成本极低（PLAN memo 提过 99% 华人，不优先）

### 2.5 运维
- `deploy.sh` 自动 `git add/commit/push` + 检测 schema 变化时跑 migrate
- `railway.json` 走 NIXPACKS + `build:prod` / `start:prod`
- 部署后 Railway 自动 `prisma db push`
- **无 CI**（GitHub Actions 没接）、**无错误监控**、**无备份策略**、**无任何测试**

---

## 三、24 个工作项明细

### R 风险修复

| ID | 标题 | 工作量 | 依赖 | 备注 |
|---|---|---|---|---|
| **R1** | 双 schema 防误：让 `db:use-postgres` 不再 cp 覆盖 `schema.prisma`，改成 `build:prod` 用 `--schema=prisma/schema.production.prisma` 直接指 prod | 0.5h | 无 | 删 `db:use-postgres` / `db:use-sqlite` 两条命令 |
| **R2** | `photoUrls` JSON 字符串 → PG 原生 `String[]`；SQLite 保留字符串；写一次性迁移脚本把现有数据 parse 成数组 | 1-2h | R1 | **生产数据迁移高风险**，必须先 `pg_dump` 备份 |
| **R3** | (a) `inquiry` 类型举报自动隐藏分支补齐；(b) 商品软删时 destroy Cloudinary 图（从 URL 反解 publicId 或在新 schema 里存 publicId 数组） | 1-2h | R2 (b 部分) | (a) 5 行代码；(b) 节约图床额度 |

### A 体验 / 性能

| ID | 标题 | 工作量 | 依赖 | 备注 |
|---|---|---|---|---|
| **A1** | 列表分页 / 无限滚动（cursor-based，避免 OFFSET 慢） | 3-4h | 无 | 当前 `take: 200` 写死 |
| **A2** | 搜索框 q 输入 300ms 防抖 | 0.25h | 无 | 立即收益 |
| **A3** | 客户端图片预压缩 | — | — | **✅ 已完成**（ImageUpload.tsx::compressImage） |
| **A4** | `<img>` 全量替换 `next/image`（缩略图 + Lightbox） | 1-2h | 无 | `next.config.mjs` 已配 Cloudinary remotePattern |
| **A5** | PWA Service Worker（离线缓存壳 + 添加到主屏） | 3-4h | 无 | manifest.json 已有，只缺 SW |
| **A6** | 骨架屏改 Suspense / Streaming | — | 大重构 | page.tsx 全 client，改 RSC 工程量极大，**本轮跳过** |

### B 搜索 / 发现

| ID | 标题 | 工作量 | 依赖 | 备注 |
|---|---|---|---|---|
| **B1** | PG 全文检索 `pg_trgm`（中文分词太麻烦，先模糊匹配） | 3-4h | 仅 PG 生效 | SQLite 路径 fallback `contains` |
| **B2** | URL query 同步筛选状态（`?cat=books&sort=newest`） | 1-2h | 无 | PLAN 提过但代码没做；是 B3 detail 页和分享的前置 |
| **B3** | 单商品 detail 页 `/item/[id]`（RSC，用于微信深链 + OG 卡） | 3-4h | B2 | 主页扁平不变，detail 仅作分享落地 |
| **B4** | "顶一下" bump 功能（利用现有 `bumpedAt`，识别码验证 + 每天限 1 次） | 1-2h | 无 | 排序加 bumpedAt 维度 |
| **B5** | OG 图片自动生成（`@vercel/og`：主页一张 + 单商品一张） | 2-3h | B3 | 微信分享卡片必备 |

### C 通知 / 互动

| ID | 标题 | 工作量 | 依赖 | 备注 |
|---|---|---|---|---|
| **C1** | 新询价邮件提醒（Resend 免费 100/天） | 2-3h | 无 | **改造建议**：发布时可选填邮件，与"卖家联系方式"独立 |
| **C2** | 关键词订阅（买家留邮件 + 关键词，新发布匹配时发通知） | 4-5h | C1 | 含邮件验证 + unsubscribe，工程量略大 |
| **C3** | 微信群机器人 | — | 群权限 | **本轮排除**：需要群主权限和 Bot 平台对接 |

### E 代码质量

| ID | 标题 | 工作量 | 依赖 | 备注 |
|---|---|---|---|---|
| **E1** | 所有 API 路由全量 zod schema 校验 | 2-3h | 无 | 替代当前 if-else，配合 TS 类型推断 |
| **E2** | 抽 service 层：`src/services/items.ts` 等 | 2-3h | E1 | route handler 只负责 HTTP，业务在 service |
| **E3** | vitest 单测（utils + service）+ Playwright e2e happy path | 4-5h | E2（部分） | 至少跑：发布 → 列表 → 询价 → 编辑 → 删除 |
| **E4** | GitHub Actions CI：typecheck + lint + build | 0.5h | 无 | 配合 E3 后跑 `vitest run` |
| **E5** | Sentry 错误监控（前后端 + source map） | 1-2h | 无 | 免费 5K events/月 |
| **E6** | 每周 `pg_dump` 自动备份（GH Actions cron → Release artifact） | 2-3h | 无 | PLAN 提过但没做 |

### G 新功能 / 玩法

| ID | 标题 | 工作量 | 依赖 | 备注 |
|---|---|---|---|---|
| **G1** | 心愿单 / 收藏（localStorage 存 itemId 数组，"心愿单" tab） | 2-3h | 无 | 无登录态，纯本地 |
| **G2** | 暗色模式（Tailwind `dark:` + 顶栏切换） | 3-4h | 无 | 影响所有组件 |
| **G3** | 二级分类（数据模型 + UI） | 3-4h | 数据迁移 | **本轮不推荐**：影响范围大 |
| **G4** | "我的所有发布"视图：按 `contactValue` 公开聚合（联系方式本就公开） | 2-3h | 无 | 不破坏匿名设计，方便一人多发管理 |

---

## 四、推荐分批节奏

### Sprint 1 — 地基 + 快赢（5-8h，**推荐起手**）

> 目标：把基础设施缺口补上，顺手交付几个高 ROI 的体验改进。

| ID | 项目 | 估时 |
|---|---|---|
| R1 | 双 schema 防误 | 0.5h |
| R3 | inquiry 自动隐藏 + Cloudinary 清图 | 1-2h |
| E4 | GitHub Actions CI | 0.5h |
| A2 | 搜索防抖 | 0.25h |
| A4 | next/image 替换 | 1-2h |
| B2 | URL state 同步 | 1-2h |
| | **合计** | **~5-8h** |

**为什么是这套：**
- R1/R3 风险低、影响面小，可独立验证
- R2（photoUrls 数组）涉及生产数据迁移，留到 Sprint 3 单独走，配合 E6 备份
- E4 CI 立起来后，后面每个 Sprint 自带质量门
- A2 / A4 / B2 都是 1-2h 的快赢，立刻让用户感知到改进
- B2 是 B3 detail 页的前置（Sprint 2 接得上）

### Sprint 2 — 分享传播 + 列表性能（10-13h）

> 目标：补齐微信群分享传播能力 + 解决列表性能上限。

| ID | 项目 | 估时 |
|---|---|---|
| A1 | 列表分页 / 无限滚动 | 3-4h |
| B3 | 单商品 detail 页 | 3-4h |
| B5 | OG 图片自动生成 | 2-3h |
| B4 | bump 顶一下 | 1-2h |

### Sprint 3 — 高级体验 + 数据迁移（10-13h）

> 目标：把"难但有价值"的活儿做掉。包含一次有备份的数据迁移。

| ID | 项目 | 估时 |
|---|---|---|
| E6 | pg_dump 周备份（**必须先于 R2**） | 2-3h |
| R2 | photoUrls → PG 原生数组 | 1-2h |
| B1 | PG 全文检索（pg_trgm） | 3-4h |
| A5 | PWA Service Worker | 3-4h |

### Sprint 4 — 通知、监控、玩法（剩下的）

| ID | 项目 | 估时 |
|---|---|---|
| C1 | 邮件提醒（改造：可选填通知邮箱） | 2-3h |
| E1 | zod 校验 | 2-3h |
| E5 | Sentry | 1-2h |
| G1 | 心愿单 | 2-3h |
| G4 | "我的所有发布"视图 | 2-3h |
| G2 | 暗色模式 | 3-4h |

### 暂不规划的（评估后再决定）

- **C2 关键词订阅**：工程量大且对核心 UX 提升有限；先看 C1 效果
- **E2 service 层重构 + E3 测试**：工程基建，可在 Sprint 4 之后单独走
- **G3 二级分类**：数据迁移成本高，等用户量起来再说
- **A6 骨架屏 Suspense 化**：需要把 page.tsx 拆 RSC，重构成本不匹配收益

---

## 五、关键风险与注意事项

### R2 / E6 — 生产数据迁移

`photoUrls` 从 JSON 字符串改成 PG 原生 `String[]` 是**破坏性 schema 变更**，
Railway 上跑 `prisma db push` 不会自动迁移数据。必须：
1. **先**完成 E6（pg_dump 备份脚本）并验证一次完整 dump
2. 写迁移脚本：先 `ALTER TABLE` 新增 `photo_urls_new String[]`，
   遍历旧字段 `JSON.parse` 写入新字段，确认无误后 drop 旧字段 rename
3. 准备一键回滚脚本（pg_dump 时的快照）

### R3 — Cloudinary 清图

现有数据库的 `photoUrls` 只存 URL，没存 publicId。两个方案：
- **方案 A（推荐）**：从 URL 反解 publicId（Cloudinary URL 结构稳定可解析）
- **方案 B**：等 R2 同时把 schema 升级为 `photos: { url, publicId }[]` 结构

R3 实施时先用方案 A（成本低），R2 时如果决定改 schema 再升级到方案 B。

### C1 — 邮件 vs 微信现实

99% 用户用微信不用邮箱通知。直接强制邮件可能没人填。改造建议：
- 发布表单加一个**可选**"通知邮箱"字段（独立于公开联系方式）
- 不填就不通知，填了才发；告知用户"仅用于通知，不公开展示"
- Sentry / 邮件服务（Resend）选型时优先考虑欧洲数据合规（用户里有些可能在校用 .edu）

### 双 schema 切换的本质问题

`prisma generate` 必须知道 provider（不能动态切），所以双 schema 是绕不开的。
R1 的解法是让 `build:prod` 直接 `--schema=prisma/schema.production.prisma`，
**完全不动 `schema.prisma`** —— 本地默认始终是 SQLite，prod 始终是 PG，
彼此不污染。

---

## 六、Sprint 1 实施记录（2026-05-11 完成）

| ID | 项目 | 落地改动 |
|---|---|---|
| R1 ✅ | 双 schema 防误 | `package.json` 删除 `db:use-postgres` / `db:use-sqlite` 两条 cp 覆盖脚本；`build:prod` / `start:prod` 已用 `--schema=...production.prisma` 直接指 prod 文件 |
| R3 ✅ | inquiry 自动隐藏 + Cloudinary 清图 | 两份 schema + 新迁移 `20260511120000_add_inquiry_status` 给 `Inquiry` 加 `status`；`/api/reports` 加 inquiry 分支；`/api/items` GET 过滤 `status=active` 留言；`/admin` 加 `unhideInquiryAction` + 隐藏留言区 + HiddenInquiryCard；`/api/items/[id]` DELETE 与 PATCH（换图）调用 `deleteCloudinaryImagesByUrls`；`/admin` 硬删 item 时同样清图；`/lib/uploader.ts` 新增 `extractCloudinaryPublicId` + `deleteCloudinaryImagesByUrls` |
| E4 ✅ | GitHub Actions CI | `.github/workflows/ci.yml`：node 20、npm ci → prisma generate → tsc → lint → build；额外 job 验证 prod schema 也能 generate |
| A2 ✅ | 搜索防抖 | `page.tsx` 加 `debouncedQ` 状态，输入 300ms 后才触发 fetch；其他 filter 仍即时生效 |
| A4 ✅ | next/image 替换 | `ItemCard`（手机封面 fill / 桌面缩略图 96px / Lightbox fill / 底部 48px 缩略）+ `ImageUpload`（80px 预览）；`ImageUpload` 里的 next/image 别名为 `NextImage` 避免和 DOM `Image` 构造器冲突 |
| B2 ✅ | URL state 同步 | 默认导出包 `<Suspense>`，内层 `HomePageInner` 用 `useSearchParams` 初始化筛选；filter / debouncedQ 变化时 `history.replaceState` 写回 URL（默认值不污染 URL） |

## 七、Sean 本地需要跑的命令（合并 Sprint 1 改动后）

```bash
# 1. 应用新 migration（给 Inquiry 加 status 字段）
npm run db:migrate

# 2. 验证一切 OK
npx tsc --noEmit
npm run lint
npm run build

# 3. 部署
./deploy.sh "feat: sprint 1 (R1/R3/E4/A2/A4/B2)"
```

部署后 Railway 的 `start:prod` 会自动 `prisma db push` 把 prod PG 也加上 `status` 列。

## 八、Sprint 2 范围（2026-05-11 对齐，待实施）

总量 22-28h，主题：**获客 + 大卖家工具 + 防误删**

| 组 | ID | 项目 | 估时 |
|---|---|---|---|
| 获客主轴 | B3 | 单商品 `/item/[id]` 页 + 分享按钮 | 3-4h |
| 获客主轴 | B5 | OG 图片自动生成（主页 + 单商品） | 2-3h |
| 大卖家工具 | 批量导入-地基 | `Item.status` 加 `draft` 枚举 + API 默认过滤 + 限速调整 | 1h |
| 大卖家工具 | 批量导入-UI | PostModal 加 tab + 批量图片上传 + 文本框 | 2-3h |
| 大卖家工具 | 批量导入-parser | 文本块解析器（YAML 风） + 预览页 + 入库 API | 4-5h |
| 大卖家工具 | 批量导入-AI 提示 | "AI 帮我生成"一键复制提示词组件 | 0.5h |
| 大卖家工具 | G4 | `/my` 卖家"我的所有发布"视图 + 草稿管理 | 2-3h |
| 获客轻量 | UTM 跟踪 | URL utm 参数捕获 + admin 渠道分布面板 | 2h |
| 获客轻量 | 一键分享 | 主页 + 单商品卡的"分享给朋友"复制按钮 | 1h |
| 获客轻量 | 微点缀 | "本月新发布 X 件" 首页角标 | 1h |
| 风险改造 | R3 延迟-表 | `PendingCloudinaryDeletion` 表 + migration | 1h |
| 风险改造 | R3 延迟-逻辑 | 软删/换图改入队列 + 机会式扫描清理 + admin 待删队列页 | 1-2h |

### Sprint 2 关键决策（已锁定）

- **批量导入格式**：纯文本块（YAML 风，`---` 分隔），不用 Excel/CSV。手机友好 + AI 工具友好 + 解析成本低
- **图片关联**：两步上传 — 卖家先一次性传所有图，平台返回编号；文本块中用 `图片: 1,3,5` 引用
- **草稿状态**：`Item.status` 新增 `'draft'`；草稿不公开列表，不计入限速，"发布"按钮一点才转为 active
- **R3 延迟清图**：Cloudinary destroy 改 24h 后机会式触发（无 cron 服务依赖，每次 GET /api/items 时扫一次过期队列）
- **微信分享 UX**：一键生成 `今日 X 件新发布 / 链接 + utm` 文本，方便群主复制粘贴

### 获客 / 推广配套建议（已和 Sean 对齐，不在本 Sprint 实施代码）

- **微信群**：给群主一份群公告模板（极简 + 详细两版）
- **小红书**：按校园季节发笔记（开学/期末/毕业/暑实习），每周 2-3 篇；账号粉丝 < 1k 时用"私信发链接"绕过简介挂链限制
- **VT subreddit** + 学生会群 + Discord 等英文渠道
- **SEO**：B3 落地后 detail 页天然支持长尾搜索"Blacksburg secondhand IKEA" 等

## 九、Sprint 2 实施记录（2026-05-11 完成）

### Batch 2A（5/11 上午完成 + 后续 UX 精修）
| ID | 项目 | 备注 |
|---|---|---|
| B3 ✅ | 单商品 detail 页 + 不跳转改造 | `/item/[id]` 仅服务外部分享链接；本站用户在 ItemCard 内完整看 |
| B5 ✅ | OG 图片 | `opengraph-image.tsx`（拉丁字符，避开中文字体）；商品 OG 直接用第一张图 |
| T15 ✅ | 分享物品信息 | 合并按钮"📋 分享物品信息"，含 URL + `utm_source=share` |

### Batch 2B（5/11 完成）
| ID | 项目 | 落地内容 |
|---|---|---|
| #9 ✅ | 草稿地基 | `Item.status` 加 `'draft'` 值（不需要 schema 改字段）；POST /api/items 接 `status`；新增 `/api/items/[id]/publish`、`/api/items/batch`、`/api/items/by-contact`（GET 公开 + POST 带 editCode 验证草稿） |
| #10 ✅ | 批量导入 UI | PostModal 加 tab，`BatchImportPanel` 组件含批量图片上传（编号 1-60） + 文本框 + 全局信息 + 预览 |
| #11 ✅ | parser + 预览 + 入库 | `src/lib/batchParser.ts`（YAML 风容错解析）+ 预览页 + `/api/items/batch` 单事务入库 |
| #12 ✅ | AI 提示词 | 一键复制提示词组件，已嵌进 BatchImportPanel |
| #13 ✅ | G4 我的发布 | `/my` 页：输入 contactValue 看 active，加输 editCode 看自己的草稿；草稿可一键发布；复用 PostModal 编辑 |
| #14 ✅ | UTM 跟踪 | `src/lib/utm.ts` sessionStorage 捕获 + Item/Inquiry 加 `utmSource` 字段 + admin 渠道分布表 |
| #16 ✅ | 本月新发布微点缀 | `/api/stats` 1h 缓存 + header 一行小字"本月已新发布 X 件 · 累计在售 Y 件" |
| #17 ✅ | 待删队列 schema | `PendingCloudinaryDeletion` 表 + migration |
| #18 ✅ | 延迟清图改造 | 软删/换图改入 24h 待删队列；GET /api/items 机会式触发 `processOverduePendingDeletions(50)` 真正 destroy；admin 加待删队列页，可取消单条 |

### Sprint 2 本机部署前要跑

```bash
# 1. 应用两个新 migration（utmSource 字段 + PendingCloudinaryDeletion 表）
npm run db:migrate

# 2. 验证（修复 Prisma client 缓存里的 utmSource TS 错）
npx tsc --noEmit
npm run lint
npm run build

# 3. 部署
./deploy.sh "feat: sprint 2B (batch import + G4 my posts + UTM + stats + R3 delay)"
```

部署后 Railway 的 `start:prod` 会自动给 prod PG `prisma db push` 加 `utmSource` 列和 `PendingCloudinaryDeletion` 表。

## 十、下一步

- Sprint 2 测试 → 部署 → 在微信群 / 小红书启动新一轮推广（详细渠道建议在第八章）
- Sprint 3 候选：A1 分页 / A5 PWA / B1 全文检索 / E5 Sentry / E6 备份 → R2 photoUrls 数组

