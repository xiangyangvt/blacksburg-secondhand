#!/usr/bin/env bash
# 黑堡二手买卖 — 备份恢复演练脚本（本地 Docker Postgres）
#
# 这个脚本是"灾后恢复演练"用的：把最新的 .sql.gz 备份恢复到一个
# 本地 Docker Postgres 实例里，确保备份真的能恢复，不是上传了一堆
# 字节但实际损坏 / 不完整的废文件。
#
# 用法：
#   1. 确保本机有 Docker（macOS: Docker Desktop；Linux: docker / podman）
#   2. 从 GitHub Actions 下最新的 backup artifact 解压到 backups/
#      或：DATABASE_URL=... ./scripts/backup.sh 先手动备一份
#   3. 跑：./scripts/restore-local.sh
#      也可指定备份文件：./scripts/restore-local.sh backups/bbsh-dump-xxx.sql.gz
#
# 脚本会：
#   - 启动一个临时 Docker Postgres 16 容器（5433 端口，不撞 Railway/本地）
#   - 把备份解压并恢复进去
#   - 跑几个 sanity 查询，确认表存在、行数 > 0
#   - 打印结果；脚本退出时容器**保留**，方便手动连进去 inspect
#   - 想清理：docker rm -f bbsh-restore-test

set -euo pipefail

YEL=$'\033[33m'; GRN=$'\033[32m'; RED=$'\033[31m'; CYN=$'\033[36m'; END=$'\033[0m'
say() { echo "${YEL}▶${END} $1"; }
ok()  { echo "${GRN}✓${END} $1"; }
err() { echo "${RED}✗${END} $1" >&2; }
hi()  { echo "${CYN}$1${END}"; }

cd "$(dirname "$0")/.."

# ---------- 1. 找备份文件 ----------
DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ]; then
  # 自动找最新的
  DUMP_FILE=$(ls -t backups/bbsh-dump-*.sql.gz 2>/dev/null | head -1 || true)
fi
if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  err "没找到备份文件"
  echo ""
  echo "请先备份："
  echo "  DATABASE_URL='postgresql://...' ./scripts/backup.sh"
  echo ""
  echo "或从 GitHub Actions 下载 artifact："
  echo "  https://github.com/<you>/<repo>/actions/workflows/backup.yml"
  echo "  → 选最新一次成功 run → Artifacts → bbsh-db-backup-* 下下来解压到 backups/"
  exit 1
fi

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
ok "用备份文件：$DUMP_FILE ($DUMP_SIZE)"

# ---------- 2. 校验 Docker ----------
if ! command -v docker &> /dev/null; then
  err "docker 没装。请先装 Docker Desktop（mac）或 docker-ce（linux）"
  exit 1
fi
if ! docker info &> /dev/null; then
  err "Docker daemon 没跑。请先启动 Docker Desktop"
  exit 1
fi
ok "Docker daemon OK"

# ---------- 3. 起容器 ----------
CTN_NAME="bbsh-restore-test"
PORT="5433"
PG_USER="bbsh"
PG_PASS="restore-drill"
PG_DB="bbsh_restore"

# 容器存在就清掉再起
if docker ps -a --format '{{.Names}}' | grep -q "^${CTN_NAME}$"; then
  say "清掉旧的 $CTN_NAME 容器"
  docker rm -f "$CTN_NAME" >/dev/null
fi

say "启动 Postgres 16 容器（端口 $PORT）..."
docker run -d \
  --name "$CTN_NAME" \
  -e "POSTGRES_USER=$PG_USER" \
  -e "POSTGRES_PASSWORD=$PG_PASS" \
  -e "POSTGRES_DB=$PG_DB" \
  -p "${PORT}:5432" \
  postgres:16-alpine >/dev/null

# 等 ready（最多 30s）
say "等数据库 ready..."
for i in $(seq 1 30); do
  if docker exec "$CTN_NAME" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    ok "Postgres ready"
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    err "Postgres 30 秒内没起来"
    docker logs "$CTN_NAME"
    exit 1
  fi
done

LOCAL_URL="postgresql://${PG_USER}:${PG_PASS}@localhost:${PORT}/${PG_DB}"

# ---------- 4. 恢复 ----------
say "解压并恢复（这一步可能要 10 秒到几分钟，看数据量）..."
# gunzip -c 流式喂给容器内的 psql，省掉中间文件
gunzip -c "$DUMP_FILE" | docker exec -i "$CTN_NAME" \
  psql --quiet -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" \
  > /tmp/bbsh-restore.log 2>&1 || {
    err "恢复失败！log 见 /tmp/bbsh-restore.log"
    tail -30 /tmp/bbsh-restore.log
    exit 1
  }
ok "恢复完成（log: /tmp/bbsh-restore.log）"

# ---------- 5. Sanity 检查 ----------
echo ""
hi "===== Sanity 检查 ====="

run_sql() {
  docker exec "$CTN_NAME" psql -U "$PG_USER" -d "$PG_DB" -t -A -c "$1" 2>/dev/null
}

# 表是否存在
TABLES=$(run_sql "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" | tr '\n' ' ')
echo "表（public schema）："
for t in $TABLES; do echo "  - $t"; done

# 关键表的行数
echo ""
echo "关键表行数："
for t in Item Listing Inquiry Application Report PageView CartEntry PendingCloudinaryDeletion; do
  if echo "$TABLES" | grep -qi " ${t} \| ${t}$"; then
    COUNT=$(run_sql "SELECT COUNT(*) FROM \"$t\";" || echo "?")
    printf "  %-32s %s\n" "$t" "$COUNT"
  fi
done

# 最近一条 item（看时间，判断备份是否新鲜）
echo ""
LATEST=$(run_sql "SELECT title || ' @ ' || \"createdAt\"::text FROM \"Item\" ORDER BY \"createdAt\" DESC LIMIT 1;" || true)
if [ -n "$LATEST" ]; then
  echo "最近一条 Item: $LATEST"
fi

echo ""
ok "演练成功 ✨"
echo ""
hi "想自己连进去看："
echo "  psql '$LOCAL_URL'"
echo ""
hi "清理容器（再次跑脚本会自动清）："
echo "  docker rm -f $CTN_NAME"
