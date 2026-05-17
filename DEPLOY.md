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
| `LLM_CHAT_MODEL` | ✓ | 默认 `deepseek-chat` |
| `LLM_UTILITY_MODEL` | ✓ | 默认 `deepseek-chat`（HTML 抽取 + 翻译） |
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
