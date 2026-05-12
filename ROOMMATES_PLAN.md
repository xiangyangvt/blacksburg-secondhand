# 室友&转租 — 产品规格 + 实施计划

> 创建：2026-05-11
> 状态：规格已对齐，待 Sprint 4 实施
> 关联文档：[PLAN.md](./PLAN.md)（原项目计划）、[UPGRADE_PLAN.md](./UPGRADE_PLAN.md)（升级总规划）

---

## 一、产品定位（核心洞察）

**找室友 ≠ 找二手商品**。差别本质：

| 维度 | 二手买卖 | 找室友 |
|---|---|---|
| 关系长度 | 30 分钟 | 6-12 个月 |
| 决策维度 | 价格 + 成色 + 位置 | 10+ 维（预算 / 位置 / 性别 / 作息 / 卫生 / 社交 / 烟酒宠物 / 来访客 / 厨房…） |
| 风险敞口 | $50 打水漂 | 半年地狱 + 押金纠纷 + 心理创伤 |
| 信任门槛 | 看一眼就知道 | 视频/见面/朋友引荐 |
| 候选池 | 一物对几十买家 | 一帖对**少数**真正合适的人 |
| 信息不对称代价 | 低 | **极高** |

**关键定位**：找室友本质是**双边信任 + 兼容性筛选问题**，不是 sales。卡片浏览只是入口，**真正的价值在「筛选 + 双向同意 + 安全联系」机制**。

---

## 二、核心设计决策（已锁定）

| 决策点 | 最终方案 | 理由 |
|---|---|---|
| 范围 | A 找室友 + B 合租伙伴 + C 转租 + D 暑期短租 | 一站覆盖室友相关全部需求 |
| 平台名称 | **室友&转租** | 直白覆盖 C 类型，避免被误解为"中介" |
| 性别筛选 | 发帖人自表达 + 用户自过滤 | FHA 合规；强制平台筛选有法律灰区 |
| 通知机制 | **不发邮件**。红点 badge + 预期管理 + filter 优先 | 与 Sean"filter 优于 match"哲学一致；社区小不需要 push |
| 表单结构 | 拆 2 个表单：**A+B 一表（卷"住"）、C+D 一表（卷"接"）** | 用户心智不同，单表单太分裂 |
| 旧数据迁移 | 累计迁移 housing 类目所有 item 到新 Listing 表，**不降权** | 老用户不被惩罚 |
| 平台切换 UI | header 第一行两个 tab：[二手] [室友&转租] | 身份认知 > 节省 40px 垂直空间 |
| Match 算法 | **不做** | filter 优先；人和人匹配是主动筛选不是系统推荐 |

---

## 三、数据模型

### Listing 表（取代旧 Item.category='housing'）

```prisma
model Listing {
  id              String   @id @default(cuid())
  type            String   // "find_roommate" | "co_rent" | "sublet" | "summer"

  // 自我表达
  posterGender    String   @default("unspecified")  // F/M/nb/unspecified
  ageRange        String?  // "22-25" 等 5 岁档
  lookingForGender String  @default("any")          // F-only/M-only/any

  // 内容
  title           String
  description     String
  photoUrls       String   // JSON 字符串，同 Item

  // 房屋信息
  hasPlace        Boolean  @default(false)
  housingLayout   String?  // "1B1B" 等
  moveInStart     DateTime?
  moveInEnd       DateTime?
  budgetMin       Int?
  budgetMax       Int?
  areas           String   // JSON 字符串数组：["Foxridge","Downtown"]

  // 7 个生活方式 chips
  sleepSchedule   String?  // "early" | "late" | "flexible"
  cleanliness     String?  // "neat" | "average" | "casual"
  social          String?  // "quiet" | "occasional" | "frequent"
  smoking         String?  // "no" | "ok" | "yes"
  drinking        String?  // "no" | "occasional" | "frequent"
  pets            String?  // "none" | "cat" | "dog" | "other"
  guests          String?  // "no" | "occasional" | "ok"

  // 联系方式（默认隐藏，approved 后双向可见）
  contactType        String
  contactValue       String
  customContactLabel String?

  // 通用元信息
  editCodeHash    String
  status          String   @default("active")  // active/matched/deleted/hidden/draft
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  bumpedAt        DateTime @default(now())
  ipAddress       String?
  utmSource       String?
  migratedFromItem Boolean @default(false)

  applications    Application[]
  attachedTo      Application[] @relation("AttachedListing")
  reports         Report[]      @relation("ListingReports")

  @@index([status, bumpedAt])
  @@index([type])
  @@index([utmSource])
}
```

### Application 表

```prisma
model Application {
  id                 String   @id @default(cuid())
  listingId          String
  applicantGender    String
  ageRange           String?
  contactType        String
  contactValue       String
  customContactLabel String?
  message            String
  editCodeHash       String  // B 自己的识别码（用于 B 后续查看/撤回自己的申请）
  attachedListingId  String?
  status             String   @default("pending")  // pending/approved/rejected/cancelled
  rejectReason       String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  ipAddress          String?
  utmSource          String?

  listing            Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
  attachedListing    Listing? @relation("AttachedListing", fields: [attachedListingId], references: [id])
  reports            Report[] @relation("ApplicationReports")

  @@index([listingId, status])
  @@index([contactValue])
}
```

### Report 扩展

`Report.targetType` 加 `listing` / `application` 两种值，新增 `listingId` / `applicationId` 可空字段。3 个不同 IP 阈值仍然触发 hidden。

---

## 四、UI / 流程

### 平台切换器（header 第一行）

```
[二手  |  室友&转租]   ← 大字 tab，wordmark 替代品
[搜索] [我的发布] [...] [发布]   ← 第二行
```

### 列表页 `/roommates` —— 3 层 filter

```
第一层 (chip row): 类型: 全部 | 找室友 | 合租 | 转租 | 暑期
第二层 (chip row): 性别(我可投) | F | M     入住期: 1月内|春|暑|秋
第三层 (折叠): 区域 chips + 预算 slider + 7 个生活方式 chips
```

filter 全部 URL 状态同步，可分享筛好的链接。

### 发帖表单：A+B 共用 / C+D 共用

**A+B 表单**：标题、描述、环境照、入住时间、预算、区域、生活方式 chips、自我表达（gender + ageRange）、希望对方（lookingForGender）、联系方式、识别码

`type=A` 强制 `hasPlace=true` + `housingLayout` 必填；`type=B` `hasPlace=false`，layout 选填（预期户型）

**C+D 表单**：所有同 A+B，**额外**入住起止固定日期（C 是 lease 结束日，D 是暑期固定日期），加 furnished / lease 接手细节

### 申请-同意流程 5 张草图

见 chat 历史（草图 1-5）；落地时按草图实现。

### "我的发布"面板的 3 大 tab

```
[二手 (n)]   [室友 (n)]   [申请收件 ●(n)]
              ↓子tab        ↓子tab
              上架/已配对    pending/approved/rejected
              /草稿/已下架
```

每个 tab 名旁挂 ●红点（有未读：pending 申请数 / 申请状态变化）

### 红点机制（badge）

```
localStorage: hb_last_my_visit = timestamp
访问 /my 时记录当前时间
fetch 数据时对比 createdAt > hb_last_my_visit → 红点
```

---

## 五、所有 Edge Case 决策（一次锁定）

| 场景 | 行为 |
|---|---|
| B 不符合 A 的性别要求 | 申请按钮**置灰**+ tooltip"对方在找 X 性别"；软劝退，不强制 |
| B 申请同一 listing 第二次 | 不允许（按钮置灰 + 跳到 /my 看状态） |
| A 删除/下架 listing | pending 应用自动 cancelled，B 看到"对方已下架" |
| B 撤回 pending 申请 | 允许 |
| B 撤回 approved/rejected | 不允许（终态） |
| A 婉拒后 B 重新申请 | **不允许**；A 可在 admin 里"重新邀请" |
| approved 后双方不要继续 | 联系方式已交换平台不参与；可手动"标记已配对"让 listing 隐藏 |
| Application spam | 同 IP 1 小时最多 5 条 application |
| 举报 | A 举报 B / B 举报 A / 任何人举报 listing；3 IP 触发 hidden |
| 婉拒原因 | A 选填（500 字内）；B 看得到 |
| 申请人显示其他申请历史 | **不显示**（隐私 > 反 spam） |

### 监控指标（后续观察）

- pending application 平均存活时间（若 > 5 天意味着 A 来 /my 太少，需重新考虑通知）
- approved / pending 比例
- rejected reason 文本（看是否多数是"已找到"还是"不合适"）

---

## 六、迁移计划

旧 housing item 映射：
- `type=sell`（转租）→ `Listing.type=sublet` (C)
- `type=buy`（求租）→ `Listing.type=co_rent` (B)

迁移默认值：
- `posterGender='unspecified'`
- `lookingForGender='any'`
- 7 个生活方式 chips = 空
- 区域 chips = 试图从 description 解析"Foxridge / Downtown / Toms Creek"等关键词；命中就填，否则空
- 入住日期 = 试图解析"6 月起"等；命中填，否则空
- `migratedFromItem=true`

迁移后 listing 卡片上挂橙色 banner：
**"📦 这是从二手市场迁移过来的旧帖。点击补充室友信息能让更多人找到你 →"**

迁移脚本：写在 migration.sql 末尾追加 SQL；也可以单独 `tsx` 脚本独立运行。

老 housing item **本体不删**，只是不再在二手主页显示（API GET /api/items 排除 category='housing'）。这样万一迁移有问题可以回退。

---

## 七、Sprint 4 任务分解（21-30h）

| ID | 子项 | 估时 |
|---|---|---|
| L1 | 数据模型：`Listing` + `Application` + `Report` 扩展 + Prisma migration | 1.5h |
| L2 | 迁移脚本：housing items → Listing；保留原 item；标 `migratedFromItem=true` | 2h |
| L3 | API：`/api/listings` GET (含 filter 全套) / POST / PATCH / DELETE | 3h |
| L4 | API：`/api/applications` POST / PATCH (approve/reject/cancel) | 2h |
| L5 | API：`/api/listings/by-contact` （我的发布查询） | 1h |
| L6 | `/roommates` 主页：listing 卡片 + 3 层 filter chip + URL 同步 | 4-5h |
| L7 | 发帖表单：A+B 表单 1 + C+D 表单 2 + 类型大按钮顶部切换 | 4h |
| L8 | Listing detail 页 `/roommates/[id]` + 「申请联系」按钮 + Application modal | 3h |
| L9 | "我的发布" panel 改造：3 大 tab（含申请收件） + 红点 badge | 3h |
| L10 | A 视角的申请管理 UI：每个 listing 下展开申请列表 + 同意/婉拒按钮 + 婉拒原因 modal | 2h |
| L11 | B 视角的申请状态 UI：在"申请收件" tab 看自己发的申请进度 + 已审批后看到对方联系方式 | 2h |
| L12 | 平台切换 tab UI（header 第一行） + 路由架构 | 1h |
| L13 | 类型 C+D 的 listing 自动过期（入住日 + N 天后 status=expired） | 1h |
| L14 | 举报机制扩展到 listing / application（admin 面板对应） | 1h |
| L15 | Cloudinary 清图扩展到 listing（沿用 24h 延迟队列） | 0.5h |

**合计：~30h**。建议分两个 batch：4A（L1-L7，地基 + UI 主线）+ 4B（L8-L15，细节流程 + 边界）。

---

## 八、与设计系统 Sprint 3 的交错

Sprint 3 是 DS-B (header 重做完整版) + DS-C (类目色系 + 新鲜度) + DS-D (最近浏览)。Sprint 4 是室友。

**互不阻塞**：
- DS-C 的类目色系应该也适配 Listing 的 4 个 type（用类似配色：A 蓝、B 绿、C 橙、D 紫）
- 新鲜度可视化应用到 Listing 卡片（`bumpedAt` 已经存在）
- 最近浏览同时记录 Item 和 Listing
- Sprint 4 实施前 DS-B 完成更好（新版 header 已经能放下平台切换 tab）

**推荐节奏**：
- Sprint 3 先完整跑完（约 12-18h）
- Sprint 4 在 DS 完成后启动（约 21-30h）
- 总计 33-48h，等于 2-3 个密集 sprint

---

## 九、Sprint 4 实施前的最后检查

✅ 范围决定：A+B+C+D 全包
✅ 法律灰区：性别走"自表达 + 用户过滤"避险
✅ 通知决策：不做邮件，靠红点 + filter
✅ 表单结构：A+B 一表，C+D 一表
✅ 迁移策略：累计迁移 + banner 引导 + 老贴不降权
✅ 红点机制：localStorage + lastVisit 时间戳对比
✅ 申请流程：pending → approved/rejected/cancelled 完整状态机
✅ Edge case：13 种场景全有决策
✅ 数据模型：Listing + Application + Report 扩展

✅ 待审：本文档
⏳ Sean 拍板进入 Sprint 4 实施

---

## 十、未来扩展（Sprint 4 之后）

不在本期范围，留 backlog：
- 视频聊天（直接在平台内做 video 介绍，免外部 SDK 暴露身份）
- 评分（曾经合租过的人能写评价）— 强冲突隐私设计，再想
- listing 模板（"研一 CS 妹子套模板"快速填）
- 智能 filter 推荐 ("你看了 5 个 F-only 9 月入住的，要不要订阅这个搜索条件？")
- 邮件通知（如果观察到 retention 问题）
