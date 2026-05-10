# 黑堡二手买卖 — 项目计划

> 最后更新：2026-05-10
> 仓库名：`blacksburg-secondhand`（MIT 许可证）
> 部署：Railway（免费域名 `*.up.railway.app`，后续可换自定义域名）

---

## 一、技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 前后端 | Next.js 15（App Router）+ TypeScript | 一体化，部署 Railway 最丝滑，社区贡献门槛低 |
| 数据库 | PostgreSQL（Railway 自带） | 免费、稳定、Prisma 支持完善 |
| ORM | Prisma | 类型安全、迁移直观 |
| UI | Tailwind CSS + shadcn/ui | 现代、扁平、易改 |
| 国际化 | next-intl | 中英双语切换 |
| 图片存储 | Cloudinary（免费 25GB） | 自带压缩 + CDN，零运维 |
| 部署 | Railway（GitHub 自动部署） | 免费 $5/月额度足够 |

---

## 二、数据模型（PostgreSQL，3 张表）

### `items` — 商品 / 求购贴
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| type | enum | `sell`（出售）/ `buy`（求购） |
| title | string | 标题 |
| description | text | 描述 |
| price | int 或 null | 单位 USD；null 表示"面议" |
| category | enum | `home` / `electronics` / `transport` / `books` / `other` |
| custom_tag | string? | 用户自填标签（如"乐器"），category=other 时尤其有用 |
| contact_type | enum | `wechat` / `phone` / `email` / `other` |
| contact_value | string | 联系方式具体值 |
| custom_contact_label | string? | contact_type=other 时的自定义标签（如"Discord"） |
| photo_urls | string[] | Cloudinary URL 数组，最多 6 张 |
| edit_code_hash | string | bcrypt 哈希（用户设的"识别码"，≥6 位明文） |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 修改时间 |
| bumped_at | timestamp | 用于排序（默认 = created_at，未来若加置顶用） |
| status | enum | `active` / `deleted`（软删，标记已售出 = deleted） |

### `inquiries` — 询价 / 留言
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| item_id | UUID | 外键 → items.id |
| contact_type | enum | 同 items |
| contact_value | string | 同 items |
| custom_contact_label | string? | 同 items |
| message | text | 留言内容 |
| created_at | timestamp | |

**编辑/删除规则**：同一 `contact_value` 的询价者可改/删自己的；商品的 `edit_code_hash` 校验通过后可删该商品下任何一条。

### `reports` — 举报
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| target_type | enum | `item` / `inquiry` |
| target_id | UUID | 被举报对象 |
| reason | string | 举报理由 |
| reporter_ip | string | 举报者 IP |
| created_at | timestamp | |

**自动隐藏**：同一 `target_id` 累计 3 条不同 IP 的举报，自动 status=hidden（仅 admin 可见，可恢复）。

---

## 三、页面与 UX

### 主页 `/`（唯一核心页，扁平化）

```
┌──────────────────────────────────────────────────┐
│  🏠 黑堡二手买卖    [搜索框________] 🔍   [中/EN] │
│                                                  │
│ ┌────┬─────────────────────────────────────────┐ │
│ │ 全部│ 类型: ⚪出售 ⚪求购 ⚪全部              │ │
│ │ 家居│ 价格: [0]─[∞]   日期: [近一周 ▾]      │ │
│ │ 电子│ 排序: [最新 ▾]                         │ │
│ │ 交通│                                         │ │
│ │ 书本│ ┌──────────────────────────────────┐   │ │
│ │ 其他│ │ [图][图][图]  IKEA 书架 — $30     │   │ │
│ │     │ │ 8 成新，自取                       │   │ │
│ │     │ │ 微信: zhang3 [📋]  发布于 2天前    │   │ │
│ │     │ │ [📋复制 "IKEA 书架 — $30"]         │   │ │
│ │     │ │ [✏️编辑] [✅已售出] [🚩举报]       │   │ │
│ │     │ │ ▾ 3 条询价                         │   │ │
│ │     │ │   └ 微信 li4: $25 行不？  [📋][✏️][🗑] │ │
│ │     │ │   └ [+ 我也想问问]                 │   │ │
│ │     │ └──────────────────────────────────┘   │ │
│ └────┴─────────────────────────────────────────┘ │
│                          [➕ 我要发布]（FAB 浮动）│
└──────────────────────────────────────────────────┘
```

**关键 UX 决策**：
- "我要发布"按钮：右下角悬浮（FAB），手机拇指最易点；桌面顶栏额外放一个。
- 点击后弹模态框，不跳页（扁平化）。
- 左侧分类导航：桌面常驻；手机折叠成顶部下拉。
- 卡片：所有信息默认展开，图片横向滚动 3 张缩略图，点击放大 lightbox。
- 复制按钮：用 `navigator.clipboard`，成功后变 "✓ 已复制" 1.5 秒。
- 询价区默认折叠，标题旁显示数量。

### 复制按钮的精确行为

| 按钮位置 | 复制内容 |
|---|---|
| 卖家联系方式旁 | 纯联系方式字符串（如 `zhang3`） |
| 商品卡片下 | `IKEA 书架 — $30`（标题 + 空格破折号空格 + 价格） |
| 询价人联系方式旁 | 纯联系方式字符串 |

### 发布/编辑模态框
单表单一屏：标题、类型、价格（数字 + "面议"复选框）、分类、自定义标签、描述、上传图片（拖拽，自动压缩到 ≤1MB）、联系方式（类型下拉+输入框）、识别码。

**注意：用 "识别码" 这个词，不用 "密码"**——避免用户误以为是账号密码、担心隐私安全。英文用 "edit code"。

**识别码字段的友好提示语**：
> 设置一个识别码（≥6 位）：以后修改或删除这条信息时输入它来证明是你发的。它**不是密码**，不会和任何账号关联，也不会发邮件。浏览器会帮你本地记住，下次发新东西自动填上同一个，方便复用。换设备或清浏览器缓存就要重新设。
>
> Set an edit code (≥6 chars): you'll enter it later to edit or delete this post. It's not a password — just a tag that proves you're the original poster. Your browser remembers it locally so it auto-fills next time.

### 编辑流程
点商品上"编辑" → 弹识别码输入框 → 校验通过 → 进入和发布相同的表单（已填好原值）。

### localStorage 自动填充逻辑（提升体验）
- 用户首次发布后，把识别码（明文）存到浏览器 `localStorage["hb_last_edit_code"]`
- 用户再次点"我要发布"，识别码字段**默认预填**这个值——同一人发多条用同一个码，方便后续统一管理
- 用户也可以手动改成不同的码（每条独立）
- 编辑某条时，先查 `localStorage["hb_codes_by_item"][itemId]` 是否存了，存了就预填到识别码输入框
- 所有校验仍走服务端（bcrypt 比对），localStorage 只是 UX 便利
- 安全说明：localStorage 数据仅在用户自己浏览器；换设备/清缓存即丢失，这是设计预期

### 私人后台 `/admin`（仅你访问，环境变量保护）
- 举报队列（按时间倒序）
- 强删任何 item / inquiry
- 看总量统计
- 不在公开计划里，但运营必须有

---

## 四、查找/筛选/排序

| 维度 | 选项 |
|---|---|
| 类别 | 家居 / 电子 / 交通 / 书本 / 其他（侧栏） |
| 类型 | 出售 / 求购 / 全部 |
| 关键词 | 标题 + 描述全文搜索（Postgres `tsvector`） |
| 价格区间 | 数字 min–max 输入 |
| 日期 | 近一日 / 近一周 / 近一月 / 全部 |
| 排序 | 最新 / 最旧 / 价格低到高 / 价格高到低 |

所有筛选条件用 URL query string 同步，方便分享链接（如 `/?cat=books&sort=newest`）。

---

## 五、运营与安全

- **数据库备份**：GitHub Actions 每周自动 `pg_dump` 存到 repo 的私有分支或 release。
- **违禁品**：README 写明禁止"枪支、毒品、活物、违法物品"，靠社区举报。
- **限速**：同 IP 每小时最多发 3 条 item / 10 条 inquiry（隐式，对真人无感）。
- **SEO**：默认允许 Google 收录商品；`robots.txt` 不屏蔽页面，但商品详情中的联系方式字段加 `<span data-noindex>` 并通过 meta 限制（防止机器人扒手机号/微信号群发）。
- **国际化**：所有 UI 文案抽到 `messages/zh.json` + `messages/en.json`，顶栏切换。
- **Mobile-first**：开发全程小屏优先，所有交互在 375px 宽度下可用。

---

## 六、开发阶段

### Phase 0 — 你准备账号（10 分钟）
1. **GitHub**（应该已有）
2. **Railway**（用 GitHub 登录，免费）
3. **Cloudinary**（注册免费账号，拿 cloud_name / api_key / api_secret）

把 Railway 和 Cloudinary 的访问信息发我，**注意：API secret 不要发公开渠道，私下贴**。

### Phase 1 — 本地 MVP（无外部依赖）
- Next.js + Prisma + SQLite（本地）+ UI 框架
- 实现：发布/列表/分类筛选/识别码编辑/询价
- 图片用本地存储 mock
- 截图给你看

### Phase 2 — 完整 UI 迭代
- 中英切换、搜索/排序/价格筛选、复制按钮、举报、求购/出售区分、日期筛选
- 我做完一版你提反馈，迭代 2–3 轮

### Phase 3 — 接图片云存 + 真数据库
- 接 Cloudinary 上传 + 自动压缩
- 切换 Prisma datasource 到 PostgreSQL，跑迁移

### Phase 4 — 部署 Railway
- 推 GitHub 公开仓库
- Railway 一键部署 + 环境变量配置
- 你拿到 `blacksburg-secondhand.up.railway.app`，自己上架真实物品测试

### Phase 5 — 小范围试推 → 微信群
- 你发给 2–3 个朋友试用，收一轮反馈再修
- 修完发大群，群公告贴 GitHub 链接

---

## 七、GitHub 仓库结构

```
blacksburg-secondhand/
├── README.md                # 中文为主，含英文段落
├── LICENSE                  # MIT
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md     # 中文
│   │   └── feature_request.md # 中文
│   └── PULL_REQUEST_TEMPLATE.md  # 中文
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── page.tsx          # 主页
│   │   ├── api/              # 后端 API
│   │   └── admin/page.tsx    # 私人后台
│   ├── components/
│   ├── lib/
│   └── messages/             # zh.json / en.json
├── public/
├── package.json
└── next.config.js
```

---

## 八、所有决策小结（防遗忘）

| 项 | 决策 |
|---|---|
| 技术栈 | Next.js + PostgreSQL |
| 图片 | Cloudinary 免费版 |
| 防滥用 | 佛系 + 举报按钮 + 隐式限速 + 3 次自动隐藏 |
| 商品生命周期 | 卖家可标记已售出，标记后直接删除 |
| 分类 | 家居 / 电子 / 交通 / 书本 / 其他 + 自定义标签 |
| 图片数 | 每条最多 6 张 |
| 询价 | 同联系方式可编辑自己；卖家可删自己商品下任何一条 |
| 搜索 | 关键词 + 价格区间 + 日期筛选 + 4 种排序 + 求购/出售区分 |
| 域名 | 先 Railway 免费域名 |
| 语言 | 中英双语切换 |
| 联系方式 | 微信 / 手机 / Email / 其他（自填标签） |
| 货币 | 仅 USD |
| 识别码（不叫"密码"） | ≥6 位，bcrypt，localStorage 自动记住并预填，丢失不可找回，发布时友好提示这不是账号密码 |
| SEO | 允许收录，联系方式做反爬虫处理 |
| 仓库 | `blacksburg-secondhand`，MIT，README 中英，模板中文 |

---

## 九、成本预估

| 项 | 月成本 |
|---|---|
| Railway（含 Postgres） | $0（免费 $5 额度内） |
| Cloudinary | $0（25GB 内） |
| 域名（可选，后期） | ~$10/年（Namecheap） |
| **合计** | **$0/月** |
