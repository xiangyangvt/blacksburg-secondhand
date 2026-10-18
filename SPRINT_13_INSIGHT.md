# Sprint 13 — 行为洞察：看懂用户卡在哪 · 规格草稿（2026-09-19）

> **状态：草稿，待 Sean 过稿。** 由 2026-09-18 / 19 的数据分析与 brainstorm 整理；代码一行未动。
> 每一条都标了来源：**【Sean】**= 他明确说的；**【建议】**= AI 提的、他以「都按你的倾向来」认可；**【猜测】**= AI 自己填的空，最需要他否决；**【事实】**= 查代码 / 查数据得到的现状。

## 为什么做【事实：2026-09-13 生产备份，5/12–9/13，只有聚合数】

- 二手：首页访客 43% 展开过物品，但加购物车 4 人、留言 4 个月 11 条。**「查看联系方式」没有持久记录**（只在 `RateLimitHit` 里留 48 小时，供反滥用用），所以分不清「走微信私聊了」还是「真的流失了」。
- 搜索：搜索词、结果数、零结果**一条都不存**。不知道大家想要什么、供给缺什么。
- 供给：6 月后每周新增物品 0–6 件。发布流程**零埋点**，不知道是没人点开「发布」还是点开后放弃。
- 来源：99.7% 的访客无 referer 无 utm；100 件物品的 `utmSource` 全空。
- 现有埋点是一信号一张表（`PageView`、`*ViewThrottle`、`CartEntry`、`EventClickThrottle`），没有通用事件层。

## 已拍板的决定

1. **【Sean】** 做埋点 + 后台「行为洞察」面板，用来看懂卡点、改产品。
2. **【建议→认可】** 加一张通用事件表 + 前端 `track()`，不再一信号一张表。
3. **【建议→认可】** 搜索词**存原文**，但像联系方式的串脱敏成 `[contact]`；隐私页同步改。
4. **【建议→认可】** 第一期只做：`reveal_contact`、`search`、发布漏斗、面板。表单放弃率、分享来源标记放第二期。
5. **【Sean】** 「卖家不回留言（15 条回 6 条）/ 申请积压（35 份 22 份 pending）」是通知问题，**停放**，不进本 sprint。

## 原则【建议，AI 自加约束——想放宽请直说】

- 只服务「看懂卡点」。不做用户画像、不做个性化、不做任何引导流量的用途（与「不为流量引导用户」一致）。
- 身份只用匿名 `hb_vid`。事件表**不存** IP、联系方式、用户正文（留言、帖子、对话内容）。
- 明细保留 **90 天**，到期删除；删之前按天滚成聚合，聚合长期保留。【猜测：90 天这个数】
- 继续自建，不引第三方 SDK。
- 埋点永远不挡用户：写入失败静默，前端 fire-and-forget（`sendBeacon`），不加任何等待。
- 后台账号（`hb_admin` cookie 在场）的行为不记，免得 Sean 自己测试污染数据。【建议】

---

## 13A 事件层

**表 `TrackEvent`**（`schema.prisma` 与 `schema.production.prisma` 同步加）【建议】

| 列 | 说明 |
|---|---|
| `id` | cuid |
| `visitorId` | `hb_vid`；没有 cookie 的请求不记 |
| `name` | 事件名，必须在白名单里 |
| `target` | 可空。`item:<id>` / `listing:<id>` / `event:<id>`，沿用 `RateLimitHit.tag` 的写法 |
| `props` | JSON 字符串，≤ 500 字符，键也走白名单 |
| `createdAt` | 索引：`(name, createdAt)`、`(visitorId, createdAt)` |

**事件名清单**放在 `src/lib/track/events.ts`，一处定义：名字、允许的 props 键、是否允许前端上报。不在清单里的一律丢弃。这是「props 没有强 schema」的补偿。【建议】

**两条写入路径**【建议】
- 服务端 `recordEvent(name, {visitorId, target, props})`：在已有 API 路由里直接调（reveal、search、发布成功 / 失败）。能在服务端记的都在服务端记——不受广告拦截、不受微信内置浏览器怪行为影响。
- 前端 `track(name, target?, props?)` → `POST /api/track`（`sendBeacon`）：只给服务端看不到的动作用（打开发布弹窗）。接口沿用 `/api/pageview` 的做法：读 `hb_vid`、不读 IP；每访客每分钟上限走现有 `checkQuota`，超了静默丢。

**保留与滚动**【建议】
- 表 `TrackDaily(day, name, key, count, visitors)`：`key` 是该事件的聚合维度（如板块、`mode`、`zero`）。
- 挂在现有 Daily Maintenance Digest（`api/admin/digest`）里：每天滚前一天的聚合，删 90 天前的明细。不新增 cron。

## 13B 查看联系方式

- 【事实】三个披露口：`items/[id]/reveal-contact`、`inquiries/[id]/reveal-contact`、`events/[id]/reveal-to-responder`，都过 `gateReveal`。室友站的联系方式走申请流程，没有 reveal 口。
- 在 `gateReveal` **放行之后**记 `reveal_contact`，`target` = 目标，`props` = `{surface: 'card'|'detail'}`。被配额拒的记 `reveal_blocked`（不带目标）。【建议】
- 同一访客对同一目标 24 小时内只记一次（与 `viewCount` 的去重口径一致），漏斗才能和「展开」对得上。【建议】
- **不**在物品卡上给卖家或买家显示「N 人看过联系方式」——那是引导，不是本 sprint 的事。【建议】

## 13C 搜索日志

- 【事实】搜索入口：首页 `GET /api/search`（`page.tsx:230,259`）与对话 `POST /api/search/chat`。室友站、信息流目前没有走 `/api/search`。
- 在 `/api/search` 里记 `search`：`props` = `{q, n, mode, sem}`——`q` 脱敏后的搜索词（≤ 80 字符，转小写、压空白）；`n` 关键词结果数；`mode` = `keyword|semantic|seller`；`sem` 语义补充条数。【建议】
- **脱敏规则**【建议】：① 命中 11F 卖家精确搜（`findSellerMatch` 有结果）→ `q='[contact]'`、`mode='seller'`；② `containsContact(q)`（`src/lib/search/chat.ts:211`，10C 已有）为真 → `q='[contact]'`；③ 其余存原文。
- 输入过程中的每次按键不记：只记真正发出去的请求；同一访客同一 `q` 10 分钟内只记一次（翻页、切筛选会重复请求）。【猜测：首页是否边输边搜，要看 `page.tsx` 的 debounce，实现时核对】
- 对话只记 `chat_turn`：`props` = `{turn, locale, cands}`（第几轮、语言、候选数）。**不存对话原文**。【建议】
- 搜索后的点击：物品展开时若当前有搜索词，给 `item_view` 事件带 `{from:'search'}`——这样能算「搜了之后有没有点开」。【建议；`viewCount` 计数器本身不动】

## 13D 发布漏斗

三个发布弹窗（`PostModal` / `ListingPostModal` / `EventPostModal`）同一套事件，`props.kind` = `item|listing|event`：【建议】

| 事件 | 在哪记 | props |
|---|---|---|
| `post_open` | 前端，弹窗打开 | `kind`, `entry`（`fab` / `my` / `empty`） |
| `post_upload_fail` | 服务端 `/api/upload` 失败分支 | `kind?`, `reason`（`size|type|cloudinary|other`） |
| `post_submit_ok` | 服务端创建成功 | `kind`, `photos`（张数）, `batch`（批量发布件数） |
| `post_submit_fail` | 服务端校验 / 配额拒绝 | `kind`, `reason`（字段名或错误码，不含用户填的值） |

`post_open` 有而 `post_submit_*` 都没有 = 放弃。第一期不记「填到哪个字段放弃」，那是第二期的表单放弃率。

## 13E 后台「行为洞察」面板

`/admin` 已经 1444 行，新面板单独一页 `/admin/insights`，从 `/admin` 顶部链过去；鉴权复用 `isAdmin`。【建议】

1. **三板块漏斗**（近 7 / 30 天切换）：到访（`PageView`）→ 展开（`*ViewThrottle` / `EventClickThrottle`）→ 查看联系方式（13B）→ 留言 / 申请（`Inquiry` / `Application` 行数）。每级显示人数与相对上一级的比例，按设备（微信 iOS / 其他手机 / 桌面）可拆。
2. **搜索**：搜索量、零结果率；**零结果词 Top 20**、高频词 Top 20；搜后点开率。
3. **发布漏斗**：打开 → 成功，按 `kind`；失败原因分布。
4. **访客概况**（现有数据就能算，不需要新埋点）：设备分布、活跃时段（美东）、回访分层（1 天 / 2–4 天 / 5+ 天）、跨板块比例。

图表遵循现有 `TrafficChart` 的样式；数字为主，图为辅。

## 13F 隐私页

- 【事实】`src/app/privacy/page.tsx` 中英两段，现写的是「路径 / referer / UA / 匿名 cookie，用于反滥用与汇总统计」。
- 加一句（中英各一）【建议，文案 Sean 过目】：「我们会记录站内操作（例如搜索词、打开发布窗口、查看联系方式的次数）来了解哪里不好用。这些记录只关联匿名访客编号，不含你的联系方式；看起来像联系方式的搜索词不会被保存。明细保留 90 天。」
- `ARCHITECTURE.md` §2 个人数据表补一行 `TrackEvent`（伪标识符 + 搜索词）。

---

## 拆 PR 与风险分级

| PR | 内容 | 级 |
|---|---|---|
| 13A | 事件表 + 清单 + `recordEvent` / `track` / `/api/track` + 保留滚动 | 2（动 schema、动生产库） |
| 13B | reveal 计数 | 1 |
| 13C | 搜索日志 + 脱敏 + 13F 隐私页（**必须同一个 PR**：先采后告知不行） | 2 |
| 13D | 发布漏斗 | 1 |
| 13E | `/admin/insights` | 1 |

不叠 PR：13A 合入后，其余从 main 各起各的。2 级等 Sean；Codex 互审 2 级只跑一轮。

## 验收

- 本地走一遍「搜索 → 展开 → 查看联系方式」「打开发布 → 放弃」「打开发布 → 成功」，`/admin/insights` 上数字对得上。
- 搜自己的微信号、搜一个手机号：库里 `q` 是 `[contact]`。
- 后台登录状态下操作：不产生事件。
- 断网 / `/api/track` 返回 500：页面无任何可见影响。
- 生产 `prisma db push` 后两张新表存在；Digest 跑一次不报错。

## 停放（只点名，不做）

- 卖家不回留言 / 申请积压 → 通知问题【Sean 拍板停放】
- 表单字段级放弃率；分享链接自动带来源（复制链接带 `utm_source`、每群一个标记）→ 第二期
- iOS Chrome 疑似 `hb_vid` 存不住（346 个访客几乎全是单页）→ 等 Sean 真机连开两页验证；若属实，访客数要打折，且要单独修
- 桌面端展开率偏低（约 30%，手机 42–60%）→ 回看 9A「桌面端折叠态不直显」
- 8 月最后一周起访客断崖（每周 ~40 → ~10）→ 增长问题，不是埋点问题
