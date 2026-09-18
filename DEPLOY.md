# 部署 & 运维 Checklist

> 黑堡社区站部署在 Railway，监听 `main` 分支自动部署。
> 本文档覆盖：首次部署、环境变量、一次性数据清理、scraper 定时任务、域名 + Resend、常见排障。

---

## 首次部署到 Railway

1. **GitHub 接入** — Railway dashboard → New Project → Deploy from GitHub → 选本 repo
2. **加 Postgres add-on** — Railway 项目里 New → Database → PostgreSQL，`DATABASE_URL` 自动注入到 service env
3. **Build 配置** — `railway.json` 已配 `npm run build:prod`（自动 swap 到 `schema.production.prisma`）
4. **Env vars** 在 Railway dashboard 配置（完整列表见下方）
5. 推 `main` 触发部署
6. 部署成功后浏览器测：
   - `/` `/roommates` `/localnews` 三个入口都 200
   - `/admin` 登录（用 `ADMIN_PASSWORD`）能进
   - 如果之前跑过 scraper 拉了 Reddit 数据，调一次清理 endpoint（见下方"一次性数据清理"）

---

## 环境变量完整列表

在 Railway service 的 Variables 里配置：

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | ✓ | Railway Postgres add-on 自动注入 |
| `CLOUDINARY_CLOUD_NAME` | 推荐 | 图片云存储；不配回落本地（不建议生产） |
| `CLOUDINARY_API_KEY` | 推荐 | 同上 |
| `CLOUDINARY_API_SECRET` | 推荐 | 同上 |
| `ADMIN_PASSWORD` | ✓ | `/admin` 后台入口；自己定一个长字符串 |
| `SCRAPER_SECRET` | ✓ | GitHub Action 触发 scraper 鉴权；用 `openssl rand -hex 32` 生成 |
| `LLM_BASE_URL` | ✓ | 默认 `https://api.deepseek.com/v1` |
| `LLM_API_KEY` | ✓ | DeepSeek API key |
| `LLM_CHAT_MODEL` | ✓ | 默认 `deepseek-v4-pro`（高峰 $1.32 / $3.96 每百万 token，非高峰减半） |
| `LLM_UTILITY_MODEL` | ✓ | 默认 `deepseek-flash`（HTML 抽取 + 翻译；旧名 `deepseek-v4-flash` 仍接受）。`deepseek-chat` 已不在 [DeepSeek 定价页](https://api-docs.deepseek.com/quick_start/pricing/)上（2026-09-18 核对），Railway 上若还是它请改掉 |
| `LLM_EMBED_API_KEY` | 可选 | OpenAI key（Sprint 10 语义搜索的 embedding）；不配则发帖不算向量、搜索只有关键词层 |
| `LLM_EMBED_MODEL` | 可选 | 默认 `text-embedding-3-small`（1536 维，与 pgvector 列绑定，别随手换） |
| `SEARCH_AI_ENABLED` | 可选 | 默认 `false`。语义搜索 / AI 助手总开关（10B 起生效）；开之前先跑完 embedding 回填 |
| `SEARCH_SEMANTIC_MIN_SIM` | 可选 | 默认 `0.35`。语义候选的余弦相似度阈值 |
| `SEARCH_AI_DAILY_BUDGET_USD` | 可选 | 默认 `2`。AI 单日总费用上限（embedding + 对话，按 `LlmUsage` 表估算）；超过后对话接口 503、第 2 层隐藏。设 `0` = 关掉对话 |
| `NEXT_PUBLIC_SITE_URL` | ✓ | 站点公开 URL（magic-link 邮件 + OG 卡片用），如 `https://blacksburg-secondhand-production.up.railway.app` |
| `RESEND_API_KEY` | 可选 | 配了才启用 magic-link 邮箱登录；不配 prod 返 503 |
| `EMAIL_FROM_ADDRESS` | 可选 | 默认 `onboarding@resend.dev`，自有域名后改 `noreply@$DOMAIN` |

GitHub repo 这边只需要一个 secret：
- `SCRAPER_SECRET` — 跟 Railway 上同名值**完全一致**

---

## 一次性数据清理（Sprint 7 Phase 3B 砍 Reddit）

Sprint 7 Phase 3B 决定砍掉 Reddit r/VirginiaTech + r/NewRiverValley 两个数据源。
scraper 已不再抓，但生产 DB 里可能有历史数据。一次性清理步骤：

```bash
# 1. 浏览器登录 /admin（用 ADMIN_PASSWORD），拿到 hb_admin cookie
# 2.（可选）先 GET 看会删多少：
curl https://$YOUR_DOMAIN/api/admin/cleanup-reddit \
  -H "Cookie: hb_admin=$ADMIN_PASSWORD"
# 返 { "dryRun": true, "totalEvents": N, "bySource": [...], "byCategory": [...] }

# 3. 确认数量后 POST 触发实际删除：
curl -X POST https://$YOUR_DOMAIN/api/admin/cleanup-reddit \
  -H "Cookie: hb_admin=$ADMIN_PASSWORD"
# 返 { "deleted": { events: N, comments: N, contactSends: N, clickThrottles: N } }
```

清完后这个 endpoint 仍保留（下个 sprint 可清理代码）。

---

## 语义搜索：pgvector 与 embedding 回填（Sprint 10A）

- Railway 的 Postgres 模板镜像 `postgres-ssl:18` 自带 pgvector（镜像 Dockerfile 装了 `postgresql-18-pgvector`），
  `schema.production.prisma` 的 `extensions = [vector]` 让 preDeploy 的 `db push` 自动 `CREATE EXTENSION IF NOT EXISTS vector`。
- HNSW 索引 Prisma 不能声明，由 `src/lib/search/vectorStore.ts` 用 `CREATE INDEX CONCURRENTLY IF NOT EXISTS` 幂等建，
  只在下面的探针 GET 与回填路径触发（发布请求不跑 DDL）；就算 `db push` 把它当 drift 删了，下次探针 / 回填会重建。
  `CONCURRENTLY` 不能在事务里跑：Railway 的 `DATABASE_URL` 是直连，Prisma 单条 raw 调用不包事务，可以执行；若将来 URL 加了 `pgbouncer=true` 需改回普通 `CREATE INDEX`。
- 部署后核对 + 回填（需先登录 `/admin` 拿到 `hb_admin` cookie）：

```bash
# 1. 探针:后端 / key / 各类型待回填数 / vector 扩展与 HNSW 索引是否存在
curl https://$YOUR_DOMAIN/api/admin/backfill-embeddings -H "Cookie: hb_admin=$HB_ADMIN"
# 2. 回填:每次最多 10 批 × 50 条 / 类型、整体 60 秒截止;返回 done=false 就再来一次
curl -X POST https://$YOUR_DOMAIN/api/admin/backfill-embeddings -H "Cookie: hb_admin=$HB_ADMIN" \
  -H 'content-type: application/json' -d '{"maxBatches":10}'
```

- 本地 SQLite 没有 vector 类型，向量存 `embeddingJson` 文本列，JS 端算余弦；本地回填用 `npm run backfill:embeddings`。
- 费用：text-embedding-3-small 每百万 token 0.02 美元，全站几百条帖子回填一次不到 1 美分。

---

## Scraper 定时跑（GitHub Action）

`.github/workflows/scrape-events.yml` 每天 12 UTC（≈ EST 7 AM / EDT 8 AM）调一次
`POST $SITE_URL/api/scraper/run`，header 带 `Authorization: Bearer $SCRAPER_SECRET`。

- 确认 Railway 上 `SCRAPER_SECRET` 跟 GH repo secrets 里同名值**完全一致**
- 也可在 repo Settings → Variables 设 `SCRAPER_ENDPOINT` 换 staging endpoint 测
- Actions → Scrape Local Events → Run workflow 可手动触发

---

## 域名 + Resend（magic-link 邮件）

- **暂时方案**：用 Railway 自带域名 + `onboarding@resend.dev`
  - 可以发邮件，但收件人邮箱可能丢 spam
- **推荐方案**：自有域名
  - 在 Resend dashboard verify 域名 DNS（SPF / DKIM）
  - `EMAIL_FROM_ADDRESS` 改 `noreply@$DOMAIN`
  - 不再丢 spam

不配 `RESEND_API_KEY` 也完全没问题，magic-link 入口会优雅返 503，用户照常用密码方案。

---

## 常见排障

| 症状 | 原因 | 修法 |
|---|---|---|
| `/localnews` 空白 | DB 没数据（scraper 还没跑过 / Reddit 砍后空白期） | 等下次 scraper cron，或 Actions 手动触发 |
| `/api/auth/magic-link/send` 返 503 | `RESEND_API_KEY` 缺 | Railway dashboard 补，或忽略（密码方案仍工作） |
| 微信分享活动卡片不显示预览图 | OG endpoint 首次访问冷启 + fetch Google Fonts | 正常，1-2s 后正常；微信侧也有自己缓存 |
| `/api/og/event/xxx` 慢 | edge runtime 首次冷启 + fetch Google Fonts (Noto Sans SC) | 正常 |
| OG 中文显示不全 | Noto Sans SC 子集 fetch 失败 | 看 server log，确认 Google Fonts CDN 可达 |
| 部署后 `/admin` 404 | `ADMIN_PASSWORD` 没配 | Railway dashboard 补 |
| Scraper Action 失败 401 | `SCRAPER_SECRET` 不一致 | Railway / GH repo secrets 两边对齐 |
| 图片上传失败 | Cloudinary 三件套缺 / 错 | 看 server log，或临时不配走本地存储 |

## 管理员会话密钥（Sprint 9E）

Railway 变量里新增 `ADMIN_SESSION_SECRET`（随机 ≥16 字符，`openssl rand -base64 32`）。不配也能跑，但会话密钥退回由 `ADMIN_PASSWORD` 经 scrypt 派生并在日志打警告，拿到一个会话 cookie 的人可以离线猜密码。`ADMIN_PASSWORD` 轮换、删除或改回默认值都会让所有管理员会话立即失效。9E 上线后需要重新登录一次。

按 IP 的限流取 `X-Forwarded-For` 的最后一段，即 Railway 边缘追加的那段。**不要在 Railway 前再套代理**（Cloudflare 等）：那样最后一段会变成代理 IP，所有用户共用一份额度（过严但不会被绕过）。合并后用 `GET /api/admin/whoami`（需管理员 cookie）核对 Railway 的 XFF 行为：带 `X-Forwarded-For: 1.2.3.4` 请求，返回的 `ip` 必须是你的真实出口 IP 而不是 1.2.3.4。

## 每日维护摘要（Sprint 9D）

- Railway 变量：`DIGEST_SECRET`（随机 ≥16 字符）、`DIGEST_EMAIL_TO`（收件邮箱）。`RESEND_API_KEY` 已有。
- GitHub：Settings → Secrets 加同一个 `DIGEST_SECRET`；可选 Variables `DIGEST_THRESHOLDS`（如 `reports=1&scraperFails=3&backupDays=8&rejects=50&aiCost=1`，0 = 关闭该项）。`aiCost`（Sprint 10D，默认 1）：昨日（UTC）AI 估算费用超过这个美元数，或当日触发过预算熔断，就进告警邮件。
- 验证：Actions → Daily Maintenance Digest → Run workflow，inputs 填 `backupDays=1` 强制触发一封；正常阈值下应"告警数 0、不发邮件"。
- 登录后台后也可直接打开 `/api/admin/digest` 看摘要 JSON（不带 `notify=1` 不发邮件）。
