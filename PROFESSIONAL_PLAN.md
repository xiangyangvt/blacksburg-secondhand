# 黑堡二手买卖 — 专业化升级 Sprint(Sprint 5)

> 创建:2026-05-13
> 状态:规划已对齐,待 Sean 拍板进入 Batch A 实施
> 关联文档:[PLAN.md](./PLAN.md) · [UPGRADE_PLAN.md](./UPGRADE_PLAN.md) · [ROOMMATES_PLAN.md](./ROOMMATES_PLAN.md)

---

## 一、本轮目标

**用户第一印象专业化** + **工程地基稳健性** + **三个超大组件重构**。一次性大改造,总预算 40h+。

不破坏现有 UX 哲学(无登录、扁平化、低摩擦),也不引入新的核心业务功能。本轮做完后项目进入"维护 + 推广"阶段。

---

## 二、已锁定的关键决策

| 决策点 | 结论 | 备注 |
|---|---|---|
| 总预算 | 40h+ 一次性 | 分 4 个 batch,每个 batch 完成后发布一次 |
| 覆盖方向 | 工程地基 + 信任&安全 + 视觉 + 社区开源 | 运营周报后续轮再说 |
| 重构范围 | MyPostsPanel / admin / ListingPostModal 三个都拆 | 拆完每个文件目标 < 400 行 |
| 法律页内容 | 参考 Craigslist / VT IT / 类似开源项目起草中英双版 | 起草后留 `LEGAL_REVIEW_TODO` 注释,后期可找 VT 法学院义务律师核 |
| 限速方案 | **本轮不做** | 当前流量不需要;现有 3-IP 自动隐藏举报已覆盖 spam 主要风险 |
| 暗色模式 | **本轮不做** | 第一印象是亮色,优先级低 |
| Sentry | 接入,免费 tier 5k/月 | `beforeSend` 主动脱敏 IP / contactValue |
| Schema.org | Item 用 `Product+Offer`,Site 用 `Organization`;**listing 不挂 RealEstateListing** | 避免 FHA 平台广告推定 |
| 测试范围 | 单测核心 lib + 1 条 e2e happy path | 不追求覆盖率,只兜底关键路径 |
| Hero strip | 仅对首访(cookie 控制)显示 1 行 + close | 不做 about-as-landing 重构 |

---

## 三、Batch 拆解

### Batch A — 工程地基 + 三大组件重构(15-18h)

整组目标:让"看代码 = 看到这是个认真做的项目"。

| ID | 子项 | 估时 | 备注 |
|---|---|---|---|
| A1 | `src/lib/schemas/*.ts` zod schema 抽出 | 1h | 单独文件,前后端共用 |
| A2 | 5 条最热 POST/PATCH 路径改 zod:`/api/items`、`/api/listings`、`/api/applications`、`/api/items/[id]/inquiries`、`/api/reports` | 3-4h | `ZodError → 400 JSON`,前端能 inline 显示字段错误 |
| A3 | Sentry 前后端接入 + source map upload + `beforeSend` 脱敏 IP/contactValue | 1.5h | 免费 tier 5k events/月 |
| A4 | vitest 单测:`batchParser` / `itemValidation` / `listingValidation` / `shareText` / `utm` / `recentViews` | 2h | CI 上跑 |
| A5 | Playwright e2e:发布二手 → 列表 → 询价 → 编辑 → 删除 1 条 happy path | 2-3h | CI 上跑,~3 分钟内 |
| A6 | 拆 `MyPostsPanel` 1144 行 → `ItemTab` / `ListingTab` / `ApplicationTab` + `useMyPostsAuth` hook | 2.5h | 拆完每个文件 < 400 行 |
| A7 | 拆 `admin/page.tsx` 1097 行 → 5 个 section 子组件(items / listings / reports / queue / channels) + 共享 admin shell | 2h | 同上 |
| A8 | 拆 `ListingPostModal` 775 行 → `RoommateForm(A+B)` / `SubletForm(C+D)` + `useListingForm` 共享 hook | 1.5h | A+B 与 C+D 表单逻辑早分叉,顺手抽 |

**Batch A 完成后发布:** `feat: sprint 5A — zod + sentry + tests + 三大组件重构`

### Batch B — 信任 & 法律 + JSON-LD(8-10h)

整组目标:陌生人 5 秒内信任。

| ID | 子项 | 估时 | 备注 |
|---|---|---|---|
| B1 | `/about` 关于页 | 1.5h | 项目缘起、维护者、贡献者、对社区承诺;中英双版 |
| B2 | `/terms` 使用条款 | 1.5h | 禁用清单、用户自负责、平台免责、室友/合租特别条款;中英双版 |
| B3 | `/privacy` 隐私政策 | 1.5h | IP / CartEntry / PageView 三块自建埋点用途透明;Cloudinary 第三方;cookie 清单 |
| B4 | `/report-abuse` 申诉与紧急下架页 | 1h | 邮件入口 + DMCA 简化版 + 危险内容快速通道 |
| B5 | Footer 整理:`/about` `/terms` `/privacy` `/report-abuse` + GitHub + License + 联系邮箱 | 0.5h | 替换现有 footer |
| B6 | JSON-LD:Item → `Product+Offer`、Site → `Organization`(layout.tsx 注入);listing 页不挂房产 schema | 1.5h | next/script `application/ld+json` |
| B7 | `sitemap.ts` 验证:动态枚举 active items + listings + 静态页 | 0.5h | 如果已动态则只补静态页 |
| B8 | 联系邮箱接入 Resend(receive only,转发到 yangxiang5136@gmail.com) | 1h | 法律页 + 申诉页统一一个邮箱出口 |

**Batch B 完成后发布:** `feat: sprint 5B — 法律页四件套 + JSON-LD + 邮箱出口`

### Batch C — 第一印象视觉精修(8-10h)

整组目标:用上 `tailwind.config.ts` 里 already-defined tokens(`cat / fresh / shadow / spring`),把第一屏抹一层光。

| ID | 子项 | 估时 | 备注 |
|---|---|---|---|
| C1 | 首页顶部 hero strip(首访 cookie 控制,1 行 + close,"开源 / 免登录 / 黑堡本地") | 1.5h | 不做 landing 页重构 |
| C2 | 类目色 chip 铺到 ItemCard + ListingCard(`cat-home/electronics/...` tokens 已配但代码没用) | 2h | 含 i18n key 校验 |
| C3 | 新鲜度小圆点(`fresh-new/today/old/stale`,基于 createdAt) | 1h | 也铺到 ListingCard |
| C4 | Material 3 timing(`spring`)铺到所有按钮 hover / 模态框开合 | 1.5h | 不动业务逻辑 |
| C5 | 空状态画风升级 | 1h | 当前是单一 PackageOpen icon,加文案变体 + CTA 多样化 |
| C6 | OG 图升级:主页加"在售 N 件 / 累计 M / Last updated YYYY-MM-DD" | 1.5h | 单商品 OG 不动(已用第一张图) |
| C7 | 微动效:加载完淡入、卡片 hover lift、复制成功的弹一下(`copied-pop` 已有,扩展) | 1h | 不追求像素完美 |

**Batch C 完成后发布:** `feat: sprint 5C — 视觉精修(类目色 + 新鲜度 + hero + 微动效)`

### Batch D — 社区开源专业化(3-5h)

| ID | 子项 | 估时 | 备注 |
|---|---|---|---|
| D1 | `CONTRIBUTING.md` + `SECURITY.md` + Issue / PR 模板 | 1h | `.github/ISSUE_TEMPLATE/` |
| D2 | README 加 screenshot(主页 + 室友页 + admin 截图缩略) | 1h | 截图放 `docs/screenshots/` |
| D3 | README 加「如何 fork 给你自己学校用」专章 | 1.5h | 改 SITE_NAME / 类目 / DATABASE_URL / Railway 一键部署清单 |
| D4 | `/roommates` 顶部「📦 老房屋数据已迁移」banner 撤掉 | 0.5h | 迁移已基本完成 |

**Batch D 完成后发布:** `feat: sprint 5D — 社区开源专业化`

---

## 四、风险与注意事项

### 1. 三大组件拆分的隐藏成本

- **i18n key 迁移**:每个组件用 useT() 拉了一堆 key,拆组件时要保证 key 不重不漏
- **props drilling**:`MyPostsPanel` 内部状态机复杂,共享 hook 设计不当反而更乱
- **测试时间**:拆完每个 tab 都得手动跑一遍 happy path,没 e2e 兜底前慢
- **建议**:Batch A 中 `A5 e2e` 先于 `A6/A7/A8 三大拆分`,让 e2e 兜底拆分质量

### 2. 法律页不是法律意见

每个法律页底部加固定免责声明:

> **This page is provided as-is and does not constitute legal advice.**
> 本页内容为开源项目自行起草,不构成法律意见。如有疑问请咨询专业律师。

并在 markdown 注释里留 `<!-- LEGAL_REVIEW_TODO: VT law school 审核 -->`

### 3. Sentry PII 脱敏必须严格

`beforeSend` hook 里要主动:
- 删 `request.headers.cookie`
- 删 `request.data.contactValue` / `request.data.editCode`
- 把 `request.headers['x-forwarded-for']` 替换成 hash 前缀(不保留全 IP)
- 启用 Sentry 后端的 "Scrub Data" PII 默认规则
- 上线前用 Sentry 自测一条假请求,在 dashboard 上确认 PII 不可见

### 4. JSON-LD 测试

`B6` 完成后用 Google Rich Results Test(<https://search.google.com/test/rich-results>)验证一遍 Item / Site 两个页面,确保 schema 通过且无 warning。

### 5. Resend 邮箱(B8)的 DKIM/SPF

Railway 域名是 `*.up.railway.app`,**不能直接挂 Resend custom domain**,只能用 Resend 的 `onboarding@resend.dev` 共享发件域。如果你想用 `@yourdomain` 收件,需要先买个域名(后续可挂 Railway 自定义域)。本轮先用 `forward.email` 之类的免费转发或直接挂 Gmail filter。

### 6. 三大组件拆完前不要并行做 Batch C

Batch C 的 `C2 类目色 chip` 会动 ListingCard。如果 ListingCard 还没拆完,合并冲突会很难。**严格顺序:A → B → C → D**。

---

## 五、本轮不做(明确排除)

| 不做项 | 理由 |
|---|---|
| 限速(Upstash / Cloudflare) | 当前流量不需要,3-IP 自动隐藏已覆盖 spam 主要面 |
| 暗色模式 | 第一印象是亮色,优先级低 |
| 邮件订阅 / Web Push / RSS | 增长方向本轮不做 |
| pg_trgm 全文检索 | 视觉精修优先于搜索精修 |
| Cursor 分页 / 无限滚动 | 200 条阈值还没到 |
| service 层完整重构 | 三大组件拆 + zod 已经够大,service 层下轮 |
| 运营周报 schedule task | 增长后再做 |

---

## 六、Sean 本地需要跑的命令(每个 batch 合并前)

```bash
# 0. 拉最新
git pull

# 1. 安装新依赖(zod / sentry / vitest / playwright 等)
npm install

# 2. 应用任何新 migration
npm run db:migrate

# 3. 验证
npx tsc --noEmit
npm run lint
npm run build
npx vitest run          # Batch A 之后才有
npx playwright test     # Batch A 之后才有

# 4. 部署
./deploy.sh "feat: sprint 5X — ..."
```

---

## 七、下一步

✅ 计划文档已就绪(本文件)
⏳ Sean 拍板进入 **Batch A — 工程地基 + 三大组件重构**
⏳ Batch A 完成 → 部署 → Batch B
⏳ Batch B 完成 → 部署 → Batch C
⏳ Batch C 完成 → 部署 → Batch D
⏳ Batch D 完成 → 部署 → 项目进入「维护 + 推广」阶段
