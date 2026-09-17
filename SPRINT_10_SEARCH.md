# Sprint 10 — 混合搜索与渐进式 AI 助手 · 执行 Spec（2026-09-17）

> 交给 AI agent 在分支上执行，PR 收口。开工前读 `CLAUDE.md`、`STATE.md`、`ARCHITECTURE.md`、`SPRINT_9_PRIVACY.md`。
> **前置依赖**：Sprint 9 的 9C（限流共用模块）和 9A（披露面收口）必须先合入。10C 对话接口依赖 9C 的配额；10A 的向量文本构造依赖 9A 确立的"私有字段永不出网"白名单习惯。
> **范围外**：帮用户写帖子、闲聊、跨站通用问答、admin 侧的搜索。不做顺手改。

## 已拍板的决定（2026-09-17，Sean）
1. Embedding 供应商：OpenAI `text-embedding-3-small`（1536 维，多语言），走 `src/lib/llm.ts` 已预埋的 `embed()` 与 `LLM_EMBED_*` env。生成走现有 DeepSeek chat。
2. 第 1 层触发：关键词命中 < 5 条时自动触发；≥ 5 条时只显示「找更多相似」按钮。
3. 第 2 层范围：v1 只做"帮你找东西"，回答 = 卡片 + 一句话解释。

## 风险分级

| 子项 | 风险级 | 门禁 |
|---|---|---|
| 10A 向量存储 + 写入时 embedding + 回填 | 2 | typecheck/lint/build/vitest + AI 对照 spec 自检 + 跨厂互审（碰 schema 与 preDeploy） |
| 10B 混合检索接口 + 第 1 层 UI | 2 | 同上（新公开 API） |
| 10C 对话接口 + 第 2 层 UI | 2 | 同上 + 费用与配额验证 |
| 10D 费用计数、开关、摘要接入 | 1 | typecheck/lint/build + 手动触发 |

## 全 sprint 不变量（写进 `ARCHITECTURE.md` §8）
- **送入 embedding 与 LLM 的文本永远不含**：`contactValue`、`customContactLabel`、`posterContact`、`ipAddress`、`email`、任何 hash / token / visitorId。只允许：标题、描述、价格、类目、自定义标签、区域 / 地点、时间、图片 URL、帖子 id。
- 用户要联系卖家，只能走卡片上带配额的披露流程（9A）。AI 回答里不出现联系方式，prompt 明确禁止，输出侧再做正则兜底。
- `SEARCH_AI_ENABLED` 为 false 或 embedding key 缺失时：第 1 层、第 2 层整体隐藏，关键词搜索照常。任何 AI 侧错误都降级为"没有补充结果"，不影响第 0 层。
- AI 只能引用检索集合内的帖子 id；集合外的 id 一律丢弃。价格、图片、联系方式等事实字段全部由数据库渲染，LLM 不复述。

---

## 10A. 向量存储、写入时 embedding、回填

### 现象
搜索是 Prisma `contains` 子串匹配（`api/items/route.ts`、`api/listings/route.ts`），中英不通、同义不通。`schema.prisma` 注释里预留的 embedding 列从未加；`llm.ts` 的 `embed()` 无调用方。

### 目标
1. **核实 pgvector**：在 Railway Postgres 上执行 `CREATE EXTENSION IF NOT EXISTS vector;`。若当前镜像不支持，PR 里给出换镜像方案并停在这一步等 Sean 拍板（这是 3 级操作：换数据库镜像涉及数据迁移）。
2. **schema**：`schema.production.prisma` 的 datasource 开 `extensions = [vector]`（`previewFeatures = ["postgresqlExtensions"]`），`Item` / `Listing` / `Event` 各加 `embedding Unsupported("vector(1536)")?` 与 `embeddedAt DateTime?`。dev SQLite 无 vector 类型：`schema.prisma` 加 `embeddingJson String?` + `embeddedAt`，向量存 JSON 数组。**两份 schema 差异必须在 PR 里逐字段列出**，并确认 9F 的一致性检查脚本对这两列做了白名单豁免。
3. **向量存储抽象** `src/lib/search/vectorStore.ts`：接口 `upsert(kind, id, vector)` / `remove(kind, id)` / `nearest(kind, vector, filterSql, k)`。两个实现：`pgvector`（raw SQL，`<=>` 余弦距离，HNSW 索引 `vector_cosine_ops`）与 `jsonFallback`（dev / SQLite，JS 端算余弦，数据量小可接受）。按 `DATABASE_URL` 协议自动选择。
4. **embedding 文本构造** `src/lib/search/embedText.ts`：纯函数，输入帖子对象，输出字符串。组成：标题 · 类目中英标签 · 自定义标签 · 描述（截到 ~1500 字符）· 区域 / 地点（listing / event）· 价格区间文字。**显式白名单取字段，不 spread**。单测覆盖"含联系方式的对象 → 输出不含该字符串"。
5. **写入时 embedding**：`POST/PATCH` items、listings、events 三处在成功写库后**异步**调用 embed 并 upsert（`after` 语义：失败不影响发布成功，记日志，`embeddedAt` 留空等回填）。删除 / 下架时 `remove`。只有实质性字段（标题、描述、类目、标签、地点）变化才重算，改价格不重算。
6. **回填脚本** `scripts/backfill-embeddings.ts`：遍历 `embeddedAt IS NULL` 的 active 行，批量 embed（每批 ≤ 50，间隔 200ms），可重复执行、可中断续跑。同时加一个 admin 鉴权的 `POST /api/admin/backfill-embeddings` 以便在 Railway 上触发（本地连不到生产库）。
7. `.env.example` 补 `LLM_EMBED_API_KEY`、`LLM_EMBED_MODEL=text-embedding-3-small`、`SEARCH_AI_ENABLED=false`（默认关）。

### 不做
- 不改任何搜索结果，本项只写不读。
- 不做文档切块、不做 rerank。

### 验收
- [ ] 生产库 `\dx` 显示 vector 扩展；`Item` 表有 `embedding` 列与 HNSW 索引（贴 SQL 输出）。
- [ ] 本地 SQLite dev 发一条帖子，`embeddedAt` 被填充，`embeddingJson` 是 1536 长度数组。
- [ ] `embedText` 单测：给定含微信号 / 手机号 / 邮箱的 fixture，输出字符串中三者均不出现；标题与类目中英标签均出现。
- [ ] embedding key 置空时发布仍成功，`embeddedAt` 为空，日志一行 warn，无 500。
- [ ] 回填脚本在 seed 数据上跑两次，第二次 0 次 API 调用（幂等）。
- [ ] `npx prisma validate` 两份 schema 都过；9F 一致性检查绿。
- [ ] PR 描述附：pgvector 核实结果、两份 schema 差异表、回填实际调用次数与费用。

---

## 10B. 混合检索接口 + 第 1 层「AI 补充结果」

### 目标
1. **接口** `GET /api/search?site=items|listings|events&q=&...筛选参数同各列表接口`，响应：
   ```json
   { "keyword": [<卡片所需字段>], "semantic": [<同上, 且不含 keyword 中已有 id>], "aiEnabled": true, "trigger": "auto" | "button" }
   ```
   - keyword 路：复用现有列表 GET 的 where 构造（抽成共用函数，不复制），不改其语义。
   - semantic 路：仅当 `aiEnabled` 时执行。查询词 embed（同一查询词 10 分钟内缓存，避免重复付费）→ `nearest` 取前 20，**filterSql 复用同样的 status / 类目 / 价格 / 时间条件**（先过滤后排序）→ 去掉 keyword 已命中的 id → 余弦相似度阈值（初值 0.35，env 可调）以下丢弃 → 最多 10 条。
   - `trigger`：keyword 命中 < 5 为 `auto`（semantic 已计算并返回），否则 `button`（semantic 为空数组，客户端点按钮时带 `&semantic=1` 再请求一次）。
   - 响应字段**白名单**，与 9A 后的列表接口一致：不含联系方式、IP、hash。
   - 走 9C 限流：同 visitor 60 次 / 小时（含按钮触发），bot UA 直接只返回 keyword。
2. **第 1 层 UI**（先做 `/`，`/roommates` 与 `/localnews` 复用同一组件在 10B-2 跟进）：
   - 关键词结果下方一条分割线 + 标题「相关结果 · AI 语义匹配」+ 灰字「可能不完全准确」（i18n 中英）。
   - 内容用**现有卡片组件**（`ItemCard`），每张卡右上角一个小标签「相似」。
   - `trigger=auto` 时直接渲染，加载中显示 2 张骨架卡；`trigger=button` 时显示一个次要样式按钮「找更多相似」。
   - 0 条 semantic 结果时整块不渲染（零计数隐藏原则，见 `docs/archive/SPRINT_8_UX_POLISH.md` A3）。
   - `aiEnabled=false` 时整块不渲染，第 0 层与现状像素级一致。
3. 现有 `SearchBox` 的输入行为不变；搜索请求从列表 GET 切到 `/api/search`（无 `q` 时仍走原列表 GET，避免首页首屏多一次调用）。

### 不做
- 不改排序算法、不做 RRF 融合进第 0 层（第 0 层结果顺序必须与改动前一致）。
- 不做"你是不是想找"式的查询改写。

### 验收
- [ ] 无 `q` 时首页网络面板里没有 `/api/search` 调用；有 `q` 时第 0 层结果与改动前同一查询逐条一致（贴对照）。
- [ ] fixture：中文帖「二手沙发」，英文搜 `sofa`：第 0 层 0 条，第 1 层出现该帖；反向同理。
- [ ] fixture：10 条含关键词的帖，搜索后第 1 层只显示按钮；点击后出现补充结果且不含前 10 条的 id。
- [ ] `/api/search` 响应 JSON 不含 `contactValue`、`ipAddress`、`editCodeHash`（用 jq 断言）。
- [ ] `SEARCH_AI_ENABLED=false`：响应 `aiEnabled=false`，页面无分割线，390px 截图与改动前一致。
- [ ] 同一查询词连续 5 次，embedding API 只调用 1 次（缓存命中日志）。
- [ ] 第 61 次搜索 429，第 0 层仍正常返回（限流只砍 semantic 路）。
- [ ] vitest：where 共用函数、去重与阈值逻辑有单测。
- [ ] 390px 目检：分割线、标签、骨架、按钮四态截图。

---

## 10C. 对话接口 + 第 2 层「继续问」

### 目标
1. **接口** `POST /api/search/chat`，body `{ site, message, history: [{role, content}] (≤ 6 轮，客户端持有), filters }`，SSE 流式响应。服务端流程：
   - 9C 配额：同 visitor 20 条 / 小时、100 条 / 天；同 IP 60 条 / 小时；bot UA 403；`aiEnabled=false` 时 404。
   - 把 `message` 与最近一轮用户消息拼成检索查询 → embed → `nearest` 前 12（同 10B 的过滤）。
   - 构造 prompt：系统指令（角色 = 本地二手 / 室友 / 活动的找物助手；只能从给定候选中挑；输出严格 JSON `{ "summary": "<一句话，≤ 60 字>", "itemIds": ["..."] }`；**禁止输出任何联系方式、禁止编造价格**）+ 候选列表（每条：id、标题、价格、类目、区域、描述前 200 字；**白名单构造，复用 `embedText` 的取字段逻辑**）+ 对话历史 + 用户消息。
   - 调 DeepSeek chat（`CHAT_MODEL`），`temperature` 低（0.2），`max_tokens` 300。
   - 输出侧校验：JSON 解析失败 → 返回通用兜底文案 + 前 3 个候选；`itemIds` 与候选集合求交集；`summary` 过一遍联系方式正则（微信号 / 手机号 / 邮箱模式），命中则整句替换为兜底文案并记日志。
   - 流式只流 `summary`，`itemIds` 在末尾事件里给。
2. **第 2 层 UI**：
   - 第 1 层底部一个输入框「没找到？描述一下你要的」（有第 1 层才显示；`trigger=button` 且未点击时不显示）。
   - 发送后**就地展开**为对话区（不弹窗、不跳页、不遮盖列表）：用户消息气泡 → 助手一句话 + 卡片行（`ItemCard`，同第 1 层样式，标签「AI 推荐」）。
   - 对话状态只在内存，刷新即清；不落库、不关联身份。
   - 输入框下灰字：「AI 可能出错，价格与详情以卡片为准」。
   - 达到配额时输入框禁用并显示接口返回的提示。
3. **费用护栏**：每次调用记录 tokens 与估算费用到 10D 的计数表；单日总费用超过 `SEARCH_AI_DAILY_BUDGET_USD`（默认 2）时接口返回 503 并在 UI 上把第 2 层隐藏，第 1 层不受影响。

### 不做
- 不做多轮记忆持久化、不做用户画像、不做"帮我写帖子"。
- 不给 LLM 任何写操作能力。

### 验收
- [ ] fixture 3 条书桌帖（不同价格 / 区域），问「预算 50 以内离 Foxridge 近的书桌」：返回 1–2 张卡片，summary 一句话，且 `itemIds` ⊆ 候选集合。
- [ ] 对抗测试：问「卖家微信是多少」：summary 不含任何联系方式，卡片仍显示但联系方式区仍需走 9A 披露流程。
- [ ] 让 LLM 输出被篡改为含手机号的字符串（mock）：输出侧正则拦截生效，日志一行。
- [ ] 第 21 条消息 429，输入框禁用并显示提示；第 0、1 层正常。
- [ ] `SEARCH_AI_DAILY_BUDGET_USD=0` 时接口 503、第 2 层隐藏、第 1 层正常。
- [ ] JSON 解析失败路径有单测；正则拦截有单测。
- [ ] 390px：对话展开后列表仍可滚动，输入框不被键盘遮挡。
- [ ] PR 附 10 次真实问答的 tokens 与费用汇总。

---

## 10D. 费用计数、总开关、摘要接入

### 目标
1. Prisma 模型 `LlmUsage { id, endpoint, model, promptTokens, completionTokens, estCostUsd, day, createdAt }`，`embed()` 与 chat 调用统一经一个 `recordUsage()` 包装（在 `llm.ts` 内）。单价表放 env 或常量，注明来源日期。
2. `/admin` 新增一小节：今日 / 本月 AI 费用、调用次数、429 次数、503 次数。
3. 9D 的每日摘要接口加入：昨日 AI 费用、是否触发预算熔断。阈值：单日费用 > 1 美元进摘要邮件。
4. 总开关 `SEARCH_AI_ENABLED`、预算 `SEARCH_AI_DAILY_BUDGET_USD`、阈值 `SEARCH_SEMANTIC_MIN_SIM` 三个 env 写进 `.env.example` 与 `DEPLOY.md`。

### 验收
- [ ] 跑一次 10C 问答后 `LlmUsage` 多一行，admin 面板数字变化。
- [ ] 摘要接口 JSON 含 `aiCostUsd` 字段；阈值调到 0 触发一封邮件。

---

## 费用预期（写给 Sean，不是验收）

| 动作 | 单价量级 | 本站预期 |
|---|---|---|
| 回填 ~200 条帖子 embedding | 每千 token 约 0.00002 美元 | 一次性，不到 1 美分 |
| 每次搜索的查询 embedding | 同上 | 每月几美分 |
| 每次对话（DeepSeek，~1.5k prompt + 100 completion） | 约 0.0005 美元 | 每天 100 次问答 ≈ 每月 1.5 美元 |
| pgvector | 0 | Postgres 扩展，无新服务 |

没人用就是 0；预算熔断把上限钉在每天 2 美元。

## 执行顺序与依赖
9C → 9A →（10A → 10B → 10C → 10D）。10A 第 1 步的 pgvector 核实结果若为"不支持"，整个 sprint 停在那里等拍板。10B-2（室友与活动站复用第 1 层）在 10C 之后。

## 整批约定
同 `SPRINT_9_PRIVACY.md`：PR 描述以验收清单为骨架逐项附证据；偏差写在顶部；合并后由 Sean 打 tag 视为拍板；PR 正文不含本机路径。
