# Sprint 8 — RESALE UX 微优化（已完工）

> 完工于 2026-07-20。执行分支 `ux-polish-2026-07`，PR #1 合入 main。
> 后续补丁：PR #2 / #3（backup workflow 的 pg client 16 → 18 及 pg_dump 全路径）、PR #4（Railway serverless 成本控制）。
> 执行结果与 spec 的偏差（落点修正、B6 选路径 B、C10 的爬虫 tradeoff、Railway 不认 `[skip ci]` 改用 watchPatterns）见 PR #1 描述。
> 以下为当时下发的原始执行 spec，原样保留。

---

# RESALE UX 微优化 Sprint · 执行 Spec（2026-07-19）

> 交给 Claude Code / Codex，在 `xiangyangvt/blacksburg-secondhand` 本地 clone 里执行。
> 来源：Sean + Claude 以手机宽度（390px）实走三个子站得出的摩擦点清单，Sean 已逐条批准。
> 范围 = 下列 8 个 UX 项 + 1 个 workflow keepalive。**不做**其它重构/顺手改。

## 0. 开工前

1. 先读 repo 根目录 `AGENTS.md` 和 `STATE.md`，遵守其中的 house rules（commit 规约、STATE 更新等），与本 spec 冲突时以 house rules 为准并在 PR 里注明。
2. 技术栈：Next.js 14 App Router + TS + Prisma + Tailwind。代码在 `src/`（`src/app` / `src/components` / `src/i18n` / `src/lib`）。
3. Railway 监听 main 自动部署 → **在分支 `ux-polish-2026-07` 上做，PR 收口**，让 Sean review 后一次性合入（若 Sean 明示可直推 main，则整批推齐再推）。
4. 下面给的组件文件是根据组件名判断的落点，动手前用代码确认；若实际结构不同，按目标行为自行定位，并在 PR 里说明。

## 1. 无图二手帖 → 紧凑卡（A1）

- 现象:文字帖（如「7月17找两个同学搬家」）在 `/` 网格里渲染成带完整图片区高度的卡，图片区整块空白，占大半屏，像 bug。
- 落点:`src/components/ItemCard.tsx`。
- 目标:`images` 为空时完全不渲染图片区,卡高 = 内容自然高度（badge+标题+价格+留言行）。`/roommates` 的 `ListingCard` 已有紧凑占位处理，可参考其模式但二手无图卡**连占位图标也不要**，纯文字更省。
- 验收:无图帖卡高明显小于有图卡；两列网格布局不破（masonry/grid 对不齐属可接受，但不得出现整块空白区）；点开展开态不受影响。

## 2. 无图活动卡 → 紧凑列表式（A2）

- 现象:`/localnews` 的 scraper 活动几乎全部无图，每张卡被 ~230px 黄色占位区（叉勺图标）统治，一屏只见 2 条，扫读性极差。
- 落点:`src/components/EventCard.tsx`（`LiveSection.tsx` 若复用同组件则同步生效，需验证）。
- 目标:无图活动改紧凑卡：类别 chip + 标题 + 时间/倒计时 + 地点，约 3 行，无大占位区。有图活动保持现大卡。
- 验收:390px 宽下 `/localnews` 一屏可见 ≥4 条无图活动；live 区与主列表都生效；点开展开态/详情页不变。

## 3. 零计数隐藏（A3）

- 现象:冷启动期满屏「👁 0」「0 人已响应」「0 条留言」，观感=「这站没人」。
- 落点:`ItemCard.tsx`、`EventCard.tsx`、`ListingCard.tsx`、留言入口行（`InquirySection` / `EventCommentSection` 的折叠头）。全局 grep 渲染计数的位置，逐一处理。
- 目标:计数为 0 时整个计数 chip/行不渲染（不是显示"0"）。留言区**展开后**的空态文案（「还没有评论 · 第一个留言…」）保留不动。留言入口行在 0 条时可整行隐藏或换成「+ 我也想问问 / 议价」单入口（现有该入口的保留现状）。
- 验收:三个子站卡片上不再出现任何「0」计数；>0 的计数正常显示。

## 4. Live 区默认展开（A4）

- 现象:live 区设计初衷「开屏第一眼看到今晚的局」，实际首屏是收起的细杠（内有 3 条也不展示）。
- 落点:`src/components/LiveSection.tsx`。先查现状是「默认收起」还是「记住了上次收起」——把结论写进 PR。
- 目标:有 live 内容（>0 条）时默认展开；用户手动收起只记 `sessionStorage`（本次会话有效，下次访问重新展开）；0 条时整个 live 区不渲染。
- 验收:新会话打开 `/localnews`，live 有内容即自动展开可见卡片。

## 5. 两套留言身份统一（B6）

- 现象:二手留言要求「微信号」（`InquirySection`），活动评论要求「昵称+回车发布」（`EventCommentSection`）。同一用户两套规则。
- 目标:用户在任一处填过身份，另一处不必重新想/重新填。两条可选实现路径，**读完两个组件+相关 schema/API 后择一**，并把选择理由写进 PR：
  - 路径 A（统一模型）:活动评论也改为「联系方式（微信号）为身份 + 可选昵称展示」，与二手对齐。若涉及 `EventComment` schema/API 改动且代价小（加可空列、旧数据兼容），可做。
  - 路径 B（保持 schema，互相预填）:两组件共用一个 localStorage 身份对象（如 `bbsh_identity: {type, value, nickname}`），任一处提交成功即写入，另一处打开表单时预填。零 schema 改动。
- 边界:**只覆盖两个留言/评论表单**。发布表单（PostModal 等）的联系方式/密码记忆是另一项（B5），Sean 未批，不要做。
- 验收:在二手留言里填过微信号后，打开活动评论，身份字段已预填（或已统一为同一字段），反向同理；刷新页面仍有效（路径 B）或模型一致（路径 A）。

## 6. 「我的」查询前空态（C8）

- 现象:「我的」弹窗在点「查找」前就渲染 4 个 (0) tab 和空态插画（「还没发过活动"），暗示"你什么都没有"，实际是还没查。
- 落点:`MyPostsPanel.tsx` / `MyEventsPanel.tsx` 及弹窗容器。
- 目标:未查询状态下：tab 不带 (0) 计数、下方区域显示引导文案（如「输入发布时的联系方式和密码，点查找」）；查询后才渲染计数与列表/空态。
- 验收:冷打开「我的」看不到任何 (0)；查找后行为不变。

## 7. Placeholder 去掉真实 ID（C9）

- 现象:留言/发布表单示例 placeholder 用了 Sean 真实 ID「yangxiang5136」。
- 落点:`src/i18n/messages.ts`（全局 `grep -r "yangxiang5136" src/` 清干净）。
- 目标:换通用示例（如 `zhang3vt`）。
- 验收:`grep -r "yangxiang5136" src/` 0 命中；中英文案都换。

## 8. 联系方式直显（C10）

- 现象:展开二手卡后联系方式藏在「查看联系方式」按钮后，多一次点击；README 承诺「所有信息一屏全开」。Sean 已确认恢复直显。
- 落点:`ItemCard.tsx` / `ItemDetailView.tsx`（找 reveal 按钮所在处）。
- 目标:展开卡直接显示「微信: xxx + 复制按钮」（即现有 reveal 后的 UI），去掉 reveal 步骤。若代码里 reveal 伴随埋点/节流逻辑（如 EventClickThrottle 类似物），保留统计但不再阻断显示。
- 注意:此改动使联系方式可被爬虫直接抓取（reveal 门此前客观上有防爬作用）。在 PR 描述里明确写出这一 tradeoff 供 Sean 最终把关；若后续需要，服务端限流是补救方向（本次不做）。
- 验收:展开任一在售帖即见联系方式与复制按钮，无需额外点击；复制功能正常。

## 9. Weekly DB Backup keepalive（防 60 天自动禁用）

- 背景:GitHub 对 60 天无 commit 的仓库自动禁用所有 scheduled workflows。本 repo 两个 cron（backup.yml / scrape-events.yml）均不产生 commit，已收到禁用警告邮件。备份 artifact 仅保留 90 天，一旦停跑将走向零备份。
- 落点:`.github/workflows/backup.yml`，三处改动：
  1. `permissions: contents: read` → `contents: write`；
  2. jobs.backup.steps 最前面加 `- uses: actions/checkout@v4`（当前 job 没有 checkout）；
  3. 「Upload backup artifact」之后追加：
  ```yaml
  - name: Keepalive commit（重置 60 天 scheduled-workflow 计时）
    run: |
      date -u +"last backup: %Y-%m-%dT%H:%M:%SZ" > .github/last-backup.txt
      git config user.name "github-actions[bot]"
      git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
      git add .github/last-backup.txt
      git commit -m "chore: weekly backup keepalive [skip ci]" || echo "nothing to commit"
      git push
  ```
- 部署副作用:此 commit 会推到 main，需确认 Railway 不因此空跑部署——`[skip ci]` 若 Railway 不认，用 `railway.json` 的 watch/ignore 配置排除 `.github/**`（二选一，验证后留其一）。
- 验收:合并后手动 `workflow_dispatch` 跑一次 backup：artifact 正常产出、`last-backup.txt` commit 出现在 main、Railway 未触发无谓部署。scrape-events.yml 无需改（任何 commit 重置的是全仓库计时）。
- 另:本批改动合入 main 本身即重置计时，无需去 UI 手动 re-enable。

## 10. 验证（整批）

1. `npm run build` 过；vitest 全过（`npm test` 或见 package.json）；若 e2e（playwright）在 CI 里跑，保持绿。
2. 手机宽度 390px 目检四个改动面:`/`（无图帖+零计数+直显联系方式）、`/localnews`（紧凑活动卡+live 展开）、留言互填、「我的」空态。
3. `grep -r "yangxiang5136" src/` = 0。
4. PR 描述逐项对照本 spec 的验收标准打勾，注明 5 的路径选择与 8 的 tradeoff。
