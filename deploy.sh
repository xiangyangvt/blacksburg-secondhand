#!/usr/bin/env bash
# 黑堡二手买卖一键部署脚本
# 用法：
#   ./deploy.sh                       # 自动生成 commit message（带时间戳）
#   ./deploy.sh "你想写的 commit 信息"  # 自定义 commit message
#
# 它会自动：
#   1. 清掉可能残留的 .git/index.lock
#   2. 检测 prisma schema 变化，自动跑 migrate
#   3. git add + commit + push 一气呵成
#   4. push 完后 Railway 自动重新部署（约 2-3 分钟）

set -u
cd "$(dirname "$0")"

YEL=$'\033[33m'; GRN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; END=$'\033[0m'
say() { echo "${YEL}▶${END} $1"; }
ok()  { echo "${GRN}✓${END} $1"; }
err() { echo "${RED}✗${END} $1" >&2; }

# ===== 1. 清理残留的 lock 文件 =====
if [ -f .git/index.lock ]; then
  say "清理残留 .git/index.lock"
  rm .git/index.lock || { err "lock 删除失败，请手动 'sudo rm .git/index.lock'"; exit 1; }
fi

# ===== 2. 看看有什么改动 =====
say "检查改动..."
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  # 没有未提交改动；看看有没有未推送的 commit
  if [ -n "$(git log @{u}..HEAD 2>/dev/null)" ]; then
    say "没有新改动，但有未推送的 commit，直接 push"
    git push && ok "推送完成" || { err "push 失败"; exit 1; }
    exit 0
  fi
  ok "工作区干净 + 没有未推送 commit，啥都不用做"
  exit 0
fi

# 列一下要提交的文件（精简显示）
echo ""
echo "${DIM}--- 即将提交的改动 ---${END}"
git status --short
echo "${DIM}-----------------------${END}"
echo ""

# ===== 3. 检测 prisma schema 是否变化 → 自动 migrate =====
SCHEMA_CHANGED=false
if git diff --name-only HEAD 2>/dev/null | grep -qE 'prisma/(schema\.prisma|migrations/)'; then
  SCHEMA_CHANGED=true
fi
if git ls-files --others --exclude-standard | grep -qE 'prisma/(schema\.prisma|migrations/)'; then
  SCHEMA_CHANGED=true
fi

if [ "$SCHEMA_CHANGED" = "true" ]; then
  say "检测到 Prisma schema/migration 变化，自动运行 db:migrate..."
  if ! npm run db:migrate; then
    err "db:migrate 失败，退出。修好后重试 ./deploy.sh"
    exit 1
  fi
  ok "数据库迁移完成"
fi

# ===== 4. 提交 =====
MSG="${1:-chore: 更新于 $(date '+%Y-%m-%d %H:%M')}"
say "git add + commit..."
git add . || { err "git add 失败"; exit 1; }
if ! git diff --cached --quiet; then
  git commit -m "$MSG" || { err "commit 失败"; exit 1; }
  ok "已提交：${MSG}"
else
  ok "没有 staged 改动（migrate 可能改了一些自动生成文件，但都被 gitignore 了）"
fi

# ===== 5. 推送 =====
say "推送到 GitHub..."
if git push; then
  ok "推送完成"
  echo ""
  echo "🚂 Railway 应该 2-3 分钟内开始重新部署"
  echo "   线上地址：https://blacksburg-secondhand-production.up.railway.app"
else
  err "push 失败 — 看上面的报错"
  exit 1
fi
