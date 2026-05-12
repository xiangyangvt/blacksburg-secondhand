#!/usr/bin/env bash
# 黑堡二手买卖 — 手动数据库备份脚本
#
# 用法：
#   1. 从 Railway dashboard 复制 PG 连接字符串
#   2. 跑：DATABASE_URL='postgresql://...' ./scripts/backup.sh
#   3. 备份产物在 backups/ 目录（已加进 .gitignore，不会被 commit）
#
# 恢复：
#   gunzip -c backups/bbsh-dump-XXX.sql.gz | psql "$NEW_DATABASE_URL"

set -euo pipefail

# 颜色
YEL=$'\033[33m'; GRN=$'\033[32m'; RED=$'\033[31m'; END=$'\033[0m'
say() { echo "${YEL}▶${END} $1"; }
ok()  { echo "${GRN}✓${END} $1"; }
err() { echo "${RED}✗${END} $1" >&2; }

# 校验环境
if [ -z "${DATABASE_URL:-}" ]; then
  err "DATABASE_URL 环境变量未设置"
  echo ""
  echo "用法："
  echo "  DATABASE_URL='postgresql://user:pass@host:5432/db' ./scripts/backup.sh"
  echo ""
  echo "Railway 上拿 DATABASE_URL："
  echo "  Railway dashboard → 项目 → Postgres → Variables 选 DATABASE_URL → 复制完整 URL"
  exit 1
fi

if ! command -v pg_dump &> /dev/null; then
  err "pg_dump 未安装"
  echo "  macOS:  brew install postgresql"
  echo "  Ubuntu: sudo apt install postgresql-client"
  exit 1
fi

# 跑
cd "$(dirname "$0")/.."
mkdir -p backups

TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
OUTFILE="backups/bbsh-dump-${TIMESTAMP}.sql.gz"

RAW="backups/bbsh-dump-${TIMESTAMP}.sql"

say "备份到 ${RAW} ..."
# 两步走（先 dump 到文件，再 gzip）—— 避免 pg_dump | gzip 管道吞错误
pg_dump "$DATABASE_URL" \
  --no-owner --no-acl --clean --if-exists \
  --file="$RAW"

RAW_BYTES=$(stat -c%s "$RAW" 2>/dev/null || stat -f%z "$RAW")
if [ "$RAW_BYTES" -lt 1024 ]; then
  err "dump 太小了（$RAW_BYTES 字节），可能连数据库失败"
  head -20 "$RAW" || true
  exit 1
fi

gzip -9 "$RAW"
SIZE=$(du -h "$OUTFILE" | cut -f1)
ok "备份完成：$OUTFILE ($SIZE)"
echo ""
echo "恢复命令：gunzip -c $OUTFILE | psql \"\$NEW_DATABASE_URL\""
