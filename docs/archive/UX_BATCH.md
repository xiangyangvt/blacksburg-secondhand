# 黑堡二手买卖 — UX 改造 Sprint(Sprint 6)

> 创建:2026-05-14
> 状态:规格已对齐,Phase 1 待启动
> 关联文档:[PLAN.md](./PLAN.md) · [UPGRADE_PLAN.md](./UPGRADE_PLAN.md) · [ROOMMATES_PLAN.md](./ROOMMATES_PLAN.md) · [PROFESSIONAL_PLAN.md](./PROFESSIONAL_PLAN.md)

---

## 〇、元规则(本轮所有判断的底)

在做任何细节决策时,按以下优先级判断,跟过往 sprint 的实施风格不同的地方都从这里来:

1. **不增加用户感知的界面复杂度**(Sean 反复强调,扁平化哲学不动摇)
2. **优先用心理学/认知科学的稳定原理**作为依据,不是"NN/g 说应该这样"
3. **NN/g / Material / Apple HIG 是 priors,不是 ground truth**。它们的样本大多是 USA / B2B / 桌面优先,套到中国学生本地社区 + WeChat-deal 文化要重新校准
4. **Truncated Pyramid 原则**:能让用户主动展开的,不要默认显示(每个教学点都先问:"用户此刻最想知道的一句话是什么")
5. **Reactance 规避**:不强制,non-blocking,给提示不阻止
6. **可逆性**:每个改动都能在 1 次部署内回滚

**真正稳的底层原理清单**(本轮引用时优先用这些):

| 原理 | 出处 | 用途 |
|---|---|---|
| Working memory 限制 (Miller 7±2 / Cowan 4) | 认知心理学 | 别一屏放太多 chip / option |
| Pre-attentive processing | Treisman 1980s | 颜色/运动/大小 < 200ms 被并行识别 → 类目色 chip 依据 |
| Selective attention / Change blindness | 视觉认知 | 用户只看预期看到的 → 教学位置不能太远 |
| Fitts's Law | HCI 经典 | 目标距离 + 大小决定可点性 → FAB 设计依据 |
| Hick's Law | HCI 经典 | 选项越多决策越慢 → 室友 filter 不可堆 |
| Reactance | 社会心理学 | 强制 → 反向心理 → 校验必须 non-blocking |
| Self-Determination Theory | Deci & Ryan | autonomy / competence / relatedness 三需求 |
| Loss aversion / 锚定 | Kahneman & Tversky,多次复现 | 微文案设计 |
| Schema theory | Bartlett 1932 | 用户对"购物车 / 我的"已有 schema,新词要么用要么避 |

**有争议/谨慎用的**(replication crisis 重灾区):社会启动效应、大部分 Cialdini 实验室外效应、具身认知、隐性态度。这些以后引用时显式标"争议"。

---

## 一、本轮背景与跟其它 sprint 的关系

### 1.1 起因

PROFESSIONAL_PLAN.md(Sprint 5)原本规划:Batch A 工程地基 + Batch B 法律页 + Batch C 视觉精修 + Batch D 社区开源,共约 35-42h。

讨论过程中 Sean 提出更深层需求:**体验做到极致 intuitive,但简化不能伤害可发现性**。又强调"和用户一起教育进化",新用户需要快速学习独创概念(识别码、询价公开性、室友申请-同意),老用户不被打扰。

在 Will UIUX 地图(NN/g Topics)框架下对当前 UX 做了一次诊断,最后达成共识:

1. UIUX 圣经需要批判性采纳
2. 决策顺序:**先做 UX 改造 → 跑 1-2 周 → 观察数据 → 决定下一轮**
3. 不做数据基建 mini-batch 在前(原讨论方向),因为有理论框架先验,先用理论指导做改造再用数据验证

### 1.2 跟 PROFESSIONAL_PLAN.md 的关系

| 原 Batch | 处置 |
|---|---|
| Batch A(工程地基 + 三大组件重构,15-18h) | **推迟到 Sprint 7**。等 UX 改造跑完观察数据再决定要不要做 |
| Batch B(法律页 + JSON-LD,8-10h) | **保留**,可并行做或推到 Sprint 8 |
| Batch C(视觉精修,8-10h) | **被本 Sprint 6 替代** — 视觉精修必须在 UX 改造之上做,先后顺序固定 |
| Batch D(社区开源,3-5h) | **保留**,推到 Sprint 8 |

### 1.3 本轮规模

13 个 UX 改造项,总工作量约 **24h**,按 7 个 Phase 独立部署。

---

## 二、Will UIUX 地图诊断的关键结论(从这里推到本轮)

诊断框架:NN/g 10 启发式 + 3 C's Microcopy + Compensatory vs Noncompensatory + Hierarchy of Trust + Truncated Pyramid。

**最该补的三个启发式缺口**:
- **H9 错误恢复**:识别码输错文案没兜底 + 全站裸 alert() + Negativity Bias 放大
- **H6 识别优于回忆**:类目色 token 配齐了但 chip 没铺
- **H4 一致性**:tokens 已配但代码没全用

**两个深层洞察**:
- **室友 listing 是 Compensatory 决策**(7 维互相补偿),但当前 filter 是 Noncompensatory(hard filter)行为 — 信息架构层面的不匹配,加教学解决不了
- **识别码概念是 Hierarchy of Trust 的 L3→L4 过渡的最大认知障碍**,这里教学投资 ROI 最高

完整诊断保留在 chat 历史,不在此重写。

---

## 三、设计规格(UX-1 到 UX-13)

每条规格的格式:
- **理论依据**(为什么)
- **设计细节**(怎么做)
- **影响范围**(改哪些文件)
- **估时**

### UX-1 · 心愿单 + ♡ icon · 0.5h

**理论依据**:Schema theory。用户脑中"购物车 + 🛒 icon = 可结账"的 schema 跟你站功能(只本地标记,不结账)不符,产生预期错位。

**设计细节**:
- i18n keys 全套改:`cart.*` → `wishlist.*`(保留向后兼容,旧 key 别立刻删)
- icon:`ShoppingCart` → `Heart`(lucide-react)
- 文案:"购物清单" → "心愿单"
- `/cart` 路由保留 + 自动 redirect 到 `/wishlist`(或主页带 `?openWishlist=1`)
- CartButton 浮动 icon 改 `Heart`
- ShoppingCartPanel 顶部加一句 helper text:"标记你想要的物品 · 不结账,只保存在本机"(配 UX-6 HelpHint 的 ? 展开)

**影响范围**:
- `src/components/CartButton.tsx`
- `src/components/ShoppingCartPanel.tsx`
- `src/i18n/messages.ts`(`cart.*` 系列)
- `src/app/page.tsx`(`?openCart=1` → `?openWishlist=1`)
- `src/app/cart/page.tsx`(redirect 兼容)

---

### UX-2 · 命名:发布 / 我发的 · 0.3h

**理论依据**:Word chunking + Selective attention。两个标签都以"我"开头 + 都关于"发布",阅读时大脑切分难度增加,尤其手机端字号小、扫读。

**设计细节**:
- `header.post`("我要发布")→ `"发布"`(单动词 CTA)
- `my.headerLink`("我的发布")→ `"我发的"`(口语,跟"我的"区分)
- 注意:`/my` 路由名不动,只动显示文案

**影响范围**:
- `src/i18n/messages.ts`

---

### UX-3 · 联系方式 non-blocking 校验 + 智能 placeholder · 1.5h

**理论依据**:Reactance(反向心理)。Blocking validation 触发用户反向心理,要么填假信息要么放弃。所以 non-blocking warning + 智能 placeholder。

**设计细节**:

**轻校验规则(失焦触发,警告不阻止)**:

```
contactType = 'wechat':
  正则 [a-zA-Z][a-zA-Z0-9_-]{5,19}
  不匹配 → 黄色警告:"微信号通常是英文+数字"
  例外:11 位纯数字 → "看起来像手机号,要切到「手机」吗?"

contactType = 'phone':
  正则 \d{10,11}
  不匹配 → "电话号通常 10-11 位数字"

contactType = 'email':
  必须含 @ 和 .
  不匹配 → "邮箱缺 @ 或 .,确认一下"

contactType = 'other':
  无校验
```

**智能 placeholder**(切换 type 时变):
- WeChat:`例: yangxiang5136(英文+数字)`
- 手机:`例: 5401234567(10-11 位)`
- 邮箱:`例: yang@vt.edu`
- 其他:`例: Discord/Instagram 等`

**影响范围**:
- `src/lib/contactValidation.ts`(新建,导出 `validateContact(type, value)`)
- `src/components/PostModal.tsx`
- `src/components/ListingPostModal.tsx`
- `src/components/InquirySection.tsx`(询价/留言也用)
- `src/components/ListingApplyModal.tsx`(申请)

---

### UX-4 · 价格上限软警告 · 0.3h

**理论依据**:Error prevention(NN/g H5)+ Anchoring。

**设计细节**:
- price `<input type="number" max="99999">` 软上限
- 失焦时 `if (price > 5000) showWarning('$5000 以上请确认,二手定价偏高')`
- 不阻止提交

**影响范围**:
- `src/components/PostModal.tsx`

---

### UX-5 · 识别码找回回路 · 5h

**理论依据**:H9 Error Recovery + Hierarchy of Trust(社区信任的人工兜底层)+ Negativity Bias(失败体验影响 4-5 倍于正向)。

**设计细节**:

#### 数据模型

```prisma
model RecoveryRequest {
  id                 String   @id @default(cuid())
  targetType         String   // "item" | "listing"
  targetId           String?  // 原帖 id(用户可能记不住,可空)
  targetContactValue String   // 自动从 targetId 拉,或用户手填
  applicantWechat    String   // 申请人微信号(Sean 加好友用)
  applicantNote      String?  // 用户描述帖子细节,用于身份验证
  ipAddress          String?
  status             String   @default("pending")
                     // pending | contacted | resolved | rejected | abuse
  adminNotes         String?
  resolvedEditCode   String?  // resolved 时记录新生成的 editCode(明文,Sean 微信发)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@index([status, createdAt])
  @@index([targetId])
}
```

#### 用户侧入口

- `EditCodePrompt` 输错 ≥ 2 次出现 "识别码丢了?[申请找回 →]" 链接
- 错 1 次只显示普通错误,避免新用户轻度输错以为永久丢失

#### 用户侧 modal

```
[申请找回识别码]

你正在申请找回帖子 #{targetId} 的识别码。

为了确认是你本人,我们需要:

你的微信号 (站长会加你确认): [_______________]
帖子细节验证(任意一条): [_____________________]
  例: 当时定价 / 第一张图是什么 / 标题大概什么

提交后 24h 内站长会加你微信确认。
本服务靠人工核对,请耐心等候。
恶意找回会被记录拒绝。

[取消] [提交]
```

#### 反 spam

- 同 IP 24h 内 ≤ 3 次
- 同 targetId 24h 内 ≤ 5 次
- 三个以上不同 IP 申请同一帖 → 自动 status=abuse 并 surface 给 admin

#### Admin 侧

`/admin` 加 `RecoveryRequestsTab`,显示 pending 列表。每条:
- 帖子 ID + 原 contactValue + 当前 contactValue 是否匹配
- 申请人微信号(一键复制)
- 申请人 note(细节验证用)
- 操作按钮:
  - "已联系" → status=contacted
  - "已重置识别码" → 生成新 editCode(随机 8 位)→ 显示给 Sean 复制 → status=resolved
  - "拒绝(滥用)" → status=rejected/abuse
  - "代用户操作" → 跳到该帖编辑(跳过 editCode 验证,但记 audit log)

#### 通知

Sean 微信发新 editCode → 用户回到站里输入 → 编辑/删除/标已售。

**影响范围**:
- `prisma/schema.prisma` + `schema.production.prisma` + 新 migration
- `src/components/EditCodePrompt.tsx`
- `src/components/RecoveryRequestModal.tsx`(新)
- `src/app/api/recovery/route.ts`(新,POST 创建,GET admin 用)
- `src/app/api/recovery/[id]/route.ts`(新,PATCH admin 用)
- `src/app/admin/page.tsx`(加 tab)

---

### UX-6 · HelpHint("?")组件 · 2.5h

**理论依据**:Truncated Pyramid(用户主动展开)+ 不增加默认界面复杂度。

**设计细节**:

#### 组件 API

```tsx
<HelpHint label="什么是识别码?">
  改 / 删 / 标已售时要用。加密保存,丢了无法找回,
  但可以用联系方式 [申请找回 →](/recover)。
  这台设备自动记住,下次发布预填。
</HelpHint>
```

渲染为旁边一个 ~14px 圆圈 `?` icon,点击展开 popup。

#### 行为差异(桌面 vs 移动)

| 平台 | 行为 |
|---|---|
| 桌面 | 点击 → 浮层 popover,贴 icon 旁定位;Esc / 点外 / ✕ 关 |
| 移动 | 点击 → 底部 sheet 滑出(popup 在小屏太难定位) |
| 键盘 | Tab 可触达,Enter 触发,Esc 关 |

不需要 cookie 记忆 — 用户主动点才看,不点不打扰。

#### 首批落点

| 位置 | 内容(草案) |
|---|---|
| PostModal 识别码字段 | "改/删/标已售时要用。加密保存,我们也看不到,丢了无法找回但可申请找回 →" |
| 心愿单 panel header | "标记你想要的物品。本地保存,不结账,关页面不丢" |
| 室友 7 维 chip 集中 dropdown | 每个维度的语义说明 |
| 室友 ListingApplyModal | "对方同意后双方互看联系方式,在此之前双方都看不到对方" |

#### A11y

- `aria-describedby` 关联 popover 内容
- `role="button"` + `aria-expanded`
- 键盘 focus 在打开时跳到 close 按钮

**影响范围**:
- `src/components/HelpHint.tsx`(新)
- `src/components/PostModal.tsx`(加 ? 在识别码字段)
- `src/components/ShoppingCartPanel.tsx`(加 ? 在 header)
- `src/components/ListingFilterBar.tsx`(7 维 chip 集中说明)
- `src/components/ListingApplyModal.tsx`

---

### UX-7 · 识别码 inline 教学(精简版) · 1h

**理论依据**:Truncated Pyramid 实例 + Owala 模式(一句话告知问题 + 给方案)。

**设计细节**:

PostModal 识别码字段下方一行小字:

```
┌─────────────────────────────────────┐
│ 识别码 (≥6 位)                    ?│  ← ? 是 UX-6 的 HelpHint
│ ┌─────────────────────────────────┐ │
│ │ yang0429                        │ │
│ └─────────────────────────────────┘ │
│ ⚠️ 改 / 删 / 标已售时要用,记住它    │  ← 灰色小字
└─────────────────────────────────────┘
```

第一层(默认显示):一行警告,极简
第二层(? popover):3 句话覆盖 90% 疑问 + 申请找回链接
第三层(极少需要):放 about/help 页里讲加密原理

**影响范围**:
- `src/components/PostModal.tsx`
- `src/components/ListingPostModal.tsx`(同步)
- `src/i18n/messages.ts`

---

### UX-8 · EditCodePrompt 输错文案重写 · 1h

**理论依据**:H9 Error Recovery + Negativity Bias。错误瞬间是用户对站负面印象生成的关键时刻,文案影响 4-5 倍于正向反馈。

**设计细节**:

错 1 次:
```
识别码不对,再试一次
```

错 2+ 次:
```
识别码不对。
- 这台设备上次发的会自动预填,可能你换了设备
- 丢了无法找回,但可以 [申请找回 →]
```

(只在错 2+ 次才出现"申请找回",避免新手误以为永久丢失)

**影响范围**:
- `src/components/EditCodePrompt.tsx`(加错误次数 state)
- `src/i18n/messages.ts`

---

### UX-9 · 类目色铺到 chip · 2h

**理论依据**:Pre-attentive processing(颜色 < 200ms 并行识别)+ Recognition vs. Recall + H4 Consistency(tokens 配了没用 = 浪费)。

**设计细节**:

#### 色和类目语义映射(已审,保留 tailwind 现有 token)

| 类目 | tailwind token | chip 实现 |
|---|---|---|
| 家居 home | emerald | `bg-emerald-50 text-emerald-700` |
| 电子 electronics | blue | `bg-blue-50 text-blue-700` |
| 交通 transport | amber | `bg-amber-50 text-amber-700` |
| 书本 books | violet | `bg-violet-50 text-violet-700` |
| 其他 other | slate | `bg-stone-100 text-stone-600` |
| ~~housing~~ | ~~pink~~ | **废弃**(已迁到 Listing 表) |

**关键**:用 `-50/100 + -700` 浅底深字,不用 `-500` 实底 — 避免 6 色拼盘视觉过载,符合扁平/低 saturation 美学。

#### 应用位置

- `ItemCard` 顶部类目 chip
- `FilterSidebar` / `MobileFilterToggle` 里的类目 chip(一致性)
- `ListingCard` 4 个 type 的 chip(`find_roommate` 蓝 / `co_rent` 绿 / `sublet` 橙 / `summer` 紫)
- `RecentViewStrip` / `RecentListingStrip` 里的 chip(若有)

**影响范围**:
- `src/components/ItemCard.tsx`
- `src/components/FilterSidebar.tsx`
- `src/components/MobileFilterToggle.tsx`
- `src/components/ListingCard.tsx`
- `src/components/ListingFilterBar.tsx`
- `src/components/RecentViewStrip.tsx`
- `src/components/RecentListingStrip.tsx`

---

### UX-10 · 室友 filter compensatory 改造 · 4.5h

**理论依据**:Compensatory vs Noncompensatory Decision Model(决策心理学)。室友选择是补偿性决策(7 维互相补偿),不是淘汰性决策(价格不合直接 pass)。当前 filter 行为是 Noncompensatory,模型不匹配。

**设计细节**:

#### matchScore 算法(客户端计算)

```typescript
function calcMatchScore(filters: ListingFilters, listing: Listing): number {
  let score = 50; // base
  for (const dimension of SEVEN_LIFESTYLE_DIMS) {
    if (!filters[dimension]) continue; // 用户没选这维 = 不计分
    if (listing[dimension] === filters[dimension]) score += 10; // 完全匹配
    else if (listing[dimension] == null || listing[dimension] === 'any') score += 2; // 对方未表态
    else if (isOpposite(filters[dimension], listing[dimension])) score -= 15; // 反向
    // 其它情况不加不减
  }
  // 同样逻辑套到 gender / age / budget / area
  return Math.max(0, Math.min(100, score));
}
```

#### 分组与排序

- `score ≥ 80` → "完全匹配" (默认展开)
- `40 ≤ score < 80` → "部分匹配" (默认展开)
- `score < 40` 但非全反向 → "近似匹配" (默认折叠 [展开])
- 反向匹配占主 → "可能不合" (折叠 + 默认隐藏,需点 "显示所有")

#### UI

列表头加 stats 行:
```
完全匹配 3 · 部分匹配 12 · 近似 8 [展开] · 可能不合 5 [显示]
```

#### 性能

- 客户端排序:listing 数量级几百,毫秒级
- 不要 server-side(每次 filter 改触发 refetch 体验更差)
- 已经 fetch 的数据 useMemo 排序,filter 改动重排不 refetch

**影响范围**:
- `src/lib/listingMatch.ts`(新,导出 `calcMatchScore` + `isOpposite`)
- `src/app/roommates/page.tsx`(改 client 端排序逻辑)
- `src/components/ListingFilterBar.tsx`(filter 行为说明)

---

### UX-11 · 微文案改 · 0.3h

**改动**:

```
"本月已新发布 X 件 · 累计在售 Y 件"
  → "本月 X 件 · 在售 Y 件"

"本站开源 · MIT 协议 · 欢迎提 issue 或 PR"
  → "MIT 开源 · 欢迎在 GitHub 提建议"
```

**影响范围**:
- `src/i18n/messages.ts`(`header.statsLine`、`footer.openSource` 等)

---

### UX-12 · alert() → toast(sonner) · 2h

**理论依据**:alert() 阻塞 JS 执行 + 浏览器原生样式不可控 + 表达过度("救护车送外卖")。Toast 不打断、自动消失、可叠加、能挂"撤销/重试"按钮。

**设计细节**:

#### 选型

- `sonner` ~3KB gzip(vercel 出,生态贴 Next.js)

#### 类型

```tsx
toast.success("已发布")
toast.error("识别码不对", { action: { label: "再试", onClick: ... } })
toast.info("此卖家还有 4 件 [一并加入]")  // 富内容(UX-13 用)
```

#### 全站替换清单(grep `alert(` + `confirm(`)

按现有 grep 估计 ~30 处,主要在:
- `src/app/page.tsx`
- `src/app/admin/page.tsx`
- `src/components/ItemCard.tsx`
- `src/components/PostModal.tsx`
- `src/components/InquirySection.tsx`
- `src/components/MyPostsPanel.tsx`
- `src/components/ListingApplyModal.tsx`
- 等

#### 整体设计

- `<Toaster />` 在 layout 里挂一次,top-right (桌面) / bottom (移动)
- 错误 toast 红色 + ⚠ icon,3-5s 持续
- 成功 toast 绿色 + ✓ icon,2-3s 持续
- 富内容(UX-13)8s + hover 暂停

**影响范围**:
- `package.json`(加 sonner dep)
- `src/app/layout.tsx`(挂 `<Toaster />`)
- 上述 ~7 个文件全站替换

---

### UX-13 · 同卖家其他物品曝光 · 3h

**理论依据**:Self-Determination Theory(competence — "我聪明,一趟搞定多件")+ 黑堡 WeChat-deal 文化先验(一次见面一锅端)+ 意图形成后的低边际成本(L4 commitment 跨过后加件几乎无成本)。

**设计细节**:

#### 触发条件

- 用户点 ♡ 加入心愿单
- **AND** 同卖家(contactValue 完全一致)还有 **≥ 2 件** 其他 active 物品
- (≥ 2 件 = 加上当前这件总 3+ 件,真有 bundle 价值)
- ≤ 1 件 → 降级为普通"已加入心愿单" toast

#### API 改动

`GET /api/items/by-contact` 加参数:
```
?contact=xxx&excludeId=yyy&limit=6&status=active
```
返回 {items: [...], total}

#### Toast UI

**桌面 (右下角)**:
```
┌────────────────────────────────────┐
│ ♥ 已加入心愿单                      │
│ ──────────────────────────────────  │
│ 此卖家还有 4 件 · 一起加入省一趟见面 │
│ ┌────┬────┬────┬────┐              │
│ │图  │图  │图  │图  │              │  ← 各带小 ♡
│ │$30 │$15 │$60 │$8  │              │
│ └────┴────┴────┴────┘              │
│       [一并加入 4 件]   [关]       │
└────────────────────────────────────┘
```

**移动 (底部 sheet)**:
```
┌────────────────────────────────────┐
│ ♥ 已加入心愿单                    ✕│
│                                    │
│ 此卖家还有 4 件 · 一起加入省一趟见面 │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ [图] IKEA 椅子   $15    [♥] │   │
│ │ [图] 显示器      $60    [♥] │   │
│ │ [图] 厨具锅      $8     [♥] │   │
│ │ [图] 书本一套    $30    [♥] │   │
│ └──────────────────────────────┘   │
│                                    │
│       [全部加入]   [跳过]          │
└────────────────────────────────────┘
```

#### 行为

- 持续时间:桌面 toast 8 秒,hover 暂停
- 不靠 cookie 抑制频率(同一卖家同一买家自然去重 — 加过的不会再被算作"还有")
- > 6 件 → 显示前 6 件(最新) + "+N 更多 →" 跳到 `/wishlist` 或 search by contact
- "全部加入"是原子操作,加入后再用户可在 cart panel 任意移除

#### 文案 character

"一起加入省一趟见面" — 带本地交易语境,不是冷冰冰电商口吻。这是你站灵魂的延伸。

#### 隐私边界

- `contactValue` 本来就是用户主动填的展示信息,公开
- 按 contact 聚合不引入新隐私问题
- 需在 `/privacy` 页(后续 Sprint 8 Batch B)明确"同联系方式发布的物品会被聚合展示"

#### 边界 case

- 加 ♡ 时网络慢/失败:toast 仍出"已加入"(乐观更新),不阻塞拉同卖家列表
- 同卖家列表 fetch 失败:静默,降级普通 toast
- 同 contact 但其实不是同一人(几乎不可能但)— 接受这个 noise,不做去重

**影响范围**:
- `src/app/api/items/by-contact/route.ts`(加 `excludeId` + `limit` 参数)
- `src/components/ItemCard.tsx`(♡ 点击后触发新逻辑)
- `src/lib/shoppingCart.ts`(`addToCart` 之后调 same-seller fetch + 触发 toast)
- `src/components/SameSellerToast.tsx`(新,sonner 自定义 content)

---

## 四、实施分 Phase

| Phase | UX-IDs | 估时 | 描述 |
|---|---|---|---|
| **1** | UX-1 + UX-2 + UX-11 | 1.1h | 命名 + 微文案,快赢,可独立部署 |
| **2** | UX-12 | 2h | toast 替换,基建,后续 UX-13 依赖 |
| **3** | UX-3 + UX-4 | 1.8h | 输入侧优化,减少死帖 |
| **4** | UX-9 + UX-10 | 6.5h | 类目色 + 室友 filter,大改动 |
| **5** | UX-6 + UX-7 + UX-8 | 4.5h | 教学层(? 组件 + 识别码 + 错误恢复) |
| **6** | UX-13 | 3h | 同卖家曝光,新功能,用户惊喜 |
| **7** | UX-5 | 5h | 找回回路,运营兜底 |

**总:~24h**

**每个 Phase 独立部署**,中间随时可暂停 / 调整 / 收集你或微信群反馈。

**部署节奏建议**:每个 Phase 完成 + Sean 本地验证 +`./deploy.sh "feat: sprint 6 phase N — ..."`。

---

## 五、风险与注意事项

### 5.1 Phase 1 命名改动的"群里通知"

`心愿单 / 我发的` 两词改完,微信群里用户可能感到"按钮不见了"。建议 Phase 1 部署后,在群里发一条"小更新:'购物清单'改名'心愿单'(更准确),'我的发布'改名'我发的'(更简洁)"。

### 5.2 类目色 vs 文化语境

`-50/700` 浅底深字组合在中国文化语境下没什么问题(绿 / 蓝 / 琥珀 / 紫都无负面联想)。但要确认你 brand 红 `#7B1113` 跟 chip 浅色们摆一起视觉协调 — 建议 Phase 4 部署前先在 staging 截图全屏看一次。

### 5.3 室友 compensatory 改造的"用户改变心智"

老用户已经习惯 hard filter(选了 chip 看不到不匹配的),改成软排序后他们可能误以为"filter 坏了"。要在 ListingFilterBar 顶部加一行小字解释:"chip 用作排序参考,不会完全过滤"(配合 UX-6 HelpHint)。

### 5.4 UX-13 的反噪音

如果同卖家曝光 toast 每次 ♡ 都触发,频繁购物用户可能烦。监控指标:**toast 关闭率 vs 一并加入率**。如果关闭率 > 80% 跑了 2 周,降级触发条件到 ≥ 3 件或加冷却期。

### 5.5 UX-5 找回回路启动后 Sean 的运营负担

每条 RecoveryRequest 你都要花 5-10 分钟微信加好友 + 验证。建议:
- Admin 面板加一个"待处理数" 红点 + 推送日期(老了的优先)
- 设一个 SLA:24h 内联系(写在用户 modal 里)
- 如果一周累计 > 10 条,这是个 signal,可能要改提醒识别码的设计(预防 > 治疗)

### 5.6 三大组件(MyPostsPanel / admin / ListingPostModal)拆分推迟的代价

PROFESSIONAL_PLAN.md Batch A 的三大组件拆分推到 Sprint 7。本轮 UX-1 / UX-2 / UX-3 / UX-5 / UX-7 / UX-8 都会动这三大组件,**每改一次,1144 行的 MyPostsPanel 都会变得更难拆**。Sprint 7 拆分的工作量可能从 6h 涨到 8-9h。Sean 接受这个 trade-off(已确认)。

### 5.7 i18n 双语兼容

虽然站默认中文,但 `messages.ts` 同时存 zh / en。所有改动需双语同步,否则切英文会回退到 key 名(很丑)。Phase 1 命名改动尤其要小心。

---

## 六、本轮不做的(明确排除)

| 项目 | 推迟到 |
|---|---|
| Truncated Pyramid 全站铺开 | Sprint 7+,等 UX 改造观察数据 |
| 数据基建 mini-batch(行为埋点) | Sprint 7,本轮做完再上 |
| 工程地基(zod + Sentry + 测试) | Sprint 7(原 PROFESSIONAL_PLAN Batch A) |
| 法律页 + JSON-LD | Sprint 8(原 Batch B) |
| 社区开源专业化(CONTRIBUTING / fork 指南) | Sprint 8(原 Batch D) |
| 暗色模式 | 待定 |
| 限速(Upstash) | 不做(当前流量不需要) |
| 邮件订阅 | 待定 |
| pg_trgm 全文检索 | 待定 |
| Cursor 分页 | 待定(`take: 200` 还没撞墙) |

---

## 七、Sprint 7+ Backlog(从本轮衍生)

按优先级:

1. **行为数据基建**(原讨论中的 mini-batch):`Event` 表 + 客户端事件采集 hook + 7-10 个核心事件埋点 + admin 简单分析面板。约 4-6h
2. **协作流程演练**:Sean 给 3-5 个行为切片,我做映射,校准 2-3 轮
3. **工程地基**:PROFESSIONAL_PLAN.md Batch A 原方案(zod + Sentry + 测试 + 三大组件拆分)
4. **新卖家激励**(UX-13 反向延伸):卖家发第 2 件时提示"买家加心愿单时会一起被看到"
5. **法律页 + JSON-LD**:PROFESSIONAL_PLAN.md Batch B 原方案
6. **社区开源 + fork 指南**:PROFESSIONAL_PLAN.md Batch D 原方案
7. **同卖家曝光的反向数据观察**:toast 关闭率 vs 一并加入率,2 周后回看
8. **室友 filter compensatory 的扩展**:加权选项("我最在乎 X 维度"),Comparison Table 多 listing 并列对比

---

## 八、Sean 本地需要跑的命令(每个 Phase 合并前)

```bash
# 0. 拉最新
git pull

# 1. 安装新依赖(只有 Phase 2 需要,加 sonner)
npm install

# 2. 应用任何新 migration(Phase 7 需要,加 RecoveryRequest 表)
npm run db:migrate

# 3. 验证
npx tsc --noEmit
npm run lint
npm run build

# 4. 部署
./deploy.sh "feat: sprint 6 phase N — ..."
```

部署后 Railway `start:prod` 自动 `prisma db push` 同步 prod schema。

---

## 九、下一步

✅ 本计划文档已就绪
⏳ Sean 拍板进入 **Phase 1**(UX-1 + UX-2 + UX-11,~1h,命名 + 微文案)
⏳ Phase 1 完成 → 部署 → 微信群通知 → Phase 2
⏳ ...
⏳ Phase 7 完成 → 部署 → 本 sprint 结束,进入 Sprint 7(数据基建 + 工程地基)
