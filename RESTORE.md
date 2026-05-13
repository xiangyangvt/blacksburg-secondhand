# 数据库恢复 / 灾备演练手册

> 一份"出事的时候我抄就能上"的应急文档。每个月跑一次演练，确保备份真的能恢复。

---

## 快速参考（30 秒版）

**线上数据没了 / Railway PG 挂了 → 做什么：**

1. 从 GitHub Actions 下最新备份：
   `https://github.com/<你>/<repo>/actions/workflows/backup.yml` → 最新 run → Artifacts → `bbsh-db-backup-*.zip`
2. 解压得到 `bbsh-dump-<TIMESTAMP>.sql.gz`
3. 在 Railway 起一个全新的 Postgres 服务，拿到 `DATABASE_URL`
4. 恢复：
   ```bash
   gunzip -c bbsh-dump-XXX.sql.gz | psql "<新 DATABASE_URL>"
   ```
5. 把 Railway 上 web 服务的 `DATABASE_URL` env var 指到新 PG
6. Redeploy web 服务

完事。

---

## 备份机制总览

- **自动**：`.github/workflows/backup.yml` 每周日 06:00 UTC（北京时间周日下午 2 点）跑一次 `pg_dump`，上传成 GitHub Actions Artifact，保留 90 天
- **手动**：
  ```bash
  DATABASE_URL='postgresql://...' ./scripts/backup.sh
  ```
  产物在 `backups/` 目录（已 .gitignore）
- **存储位置**：GitHub Actions artifact（90 天滚动）。如果想再加一层冷备份（S3 / 个人盘），见下文"延伸"

---

## 月度演练 SOP（10 分钟）

每月 1 号跑一次，确保备份没坏。流程：

### 准备

- Docker Desktop（mac）或 docker-ce（linux）安装并运行
- 仓库 clone 到本地

### 步骤

1. **拿一份新鲜备份**
   - 从 GitHub Actions 下最新 artifact 解压到 `backups/`
   - 或直接：`DATABASE_URL='<railway prod url>' ./scripts/backup.sh`

2. **跑演练脚本**
   ```bash
   ./scripts/restore-local.sh
   ```
   脚本会自动：
   - 起一个 `bbsh-restore-test` Docker 容器（Postgres 16，端口 5433）
   - 把最新 `backups/bbsh-dump-*.sql.gz` 解压恢复进去
   - 跑 sanity 查询打印每张表的行数 + 最近一条 Item

3. **检查输出**
   - ✅ 关键表都在：`Item / Listing / Inquiry / Application / Report / PageView / CartEntry / PendingCloudinaryDeletion`
   - ✅ 行数 > 0（除非这张表本来就空）
   - ✅ 最近一条 Item 的 `createdAt` 离今天不远（≤ 1 周）
   - ❌ 如果脚本失败、行数全 0、或最近 Item 异常老 → 是备份本身坏了，立刻调查

4. **手动 spot-check（可选但推荐）**
   ```bash
   psql 'postgresql://bbsh:restore-drill@localhost:5433/bbsh_restore'
   ```
   ```sql
   SELECT id, title, "createdAt" FROM "Item" ORDER BY "createdAt" DESC LIMIT 5;
   SELECT id, title, "createdAt" FROM "Listing" ORDER BY "createdAt" DESC LIMIT 5;
   ```

5. **清理**
   ```bash
   docker rm -f bbsh-restore-test
   ```

6. **记录**：在 `DRILL_LOG.md`（或随手 commit message）写一行：
   `2026-05-13: restore drill OK, latest backup 2026-05-10, X items / Y listings`

---

## 真出事了：完整恢复流程

### 场景 A：误删了一条 / 一批数据，DB 还在

不要全恢复！太重了。两个选项：

1. **如果是最近**：从恢复演练用的 Docker 容器里把那条数据 dump 出来，手动 INSERT 回 prod
   ```bash
   docker exec bbsh-restore-test pg_dump \
     -U bbsh -d bbsh_restore \
     --data-only --table='"Item"' \
     --where='"id" IN (...)' \
     > recovered.sql
   psql '<prod DATABASE_URL>' < recovered.sql
   ```
2. **如果数据是老的**：算了，告诉用户重新发一遍

### 场景 B：整个 PG 实例挂了 / Railway 误操作 / 数据库被清空

1. **冷静**。先去 Railway dashboard 看 PG 服务状态：是真挂了还是网络抖动
2. 如果 Railway PG 实例本身有快照（付费 plan 才有），优先用 Railway 自己的 point-in-time restore
3. 否则走"30 秒版"恢复流程：起新 PG → gunzip + psql → 切 env var → redeploy
4. **关键提醒**：恢复完一定要去 admin 页 `/admin` 检查最新 item / listing 时间戳，确保不是恢复了一个老备份

### 场景 C：迁移失败 / schema 损坏

1. 不要直接在 prod 跑 `prisma migrate`！先回滚
2. 起新 PG，恢复最新备份
3. 在恢复后的库上单独验证 migration：`prisma migrate deploy`
4. 全过了再切 env var

---

## 关于备份大小 / 时间

参考值（数据量小的早期阶段）：
- 备份 .sql.gz 通常 < 1 MB
- 恢复时间 < 10 秒

数据涨上来之后，关注：
- 备份文件 > 100 MB → 考虑加压缩档位 / 转列存
- 恢复 > 1 分钟 → 考虑加并行 `pg_restore -j`（注意 .sql 文本 dump 没法并行；如果要并行得改成 `pg_dump -Fc` custom format）

---

## 常见坑

| 坑 | 表现 | 怎么修 |
|---|---|---|
| pg_dump 客户端版本和 server 不匹配 | "server version mismatch" / dump 失败 | GitHub Actions workflow 装了 pgdg postgresql-client-16，本地 `brew upgrade postgresql@16` |
| `pg_dump \| gzip` 管道吞错误 | dump 文件 20 字节空 .gz | 用 `set -o pipefail` + size 检查（脚本已加） |
| 恢复时 ON CONFLICT | 表已有数据 + dump 是 `--clean --if-exists` 模式 | dump 的是 DROP TABLE 再 CREATE，应该 OK；如果不是，先 TRUNCATE 目标库 |
| Cloudinary 图链 | 备份只含 PG 数据，不含图床上的图 | 图存 Cloudinary 那边，是另一条命；月度演练时检查 Cloudinary 用量 + 资源数（admin 页有 widget） |
| 备份 artifact 90 天过期 | 找不到老备份 | 演练就是为了发现备份能不能用；老备份不能用就是不能用，没救 |

---

## 延伸（可选，等量上来再做）

- **冷备份双写**：workflow 末尾加一步把 .sql.gz 推到 S3 / Backblaze B2 / 个人 NAS
- **加密**：备份里有用户联系方式哈希，应当加密上传。`gpg --symmetric` 一行的事
- **每日备份**：cron 改 `0 6 * * *`，retention 缩到 30 天
- **告警**：workflow 失败时发邮件 / WeChat webhook 通知
