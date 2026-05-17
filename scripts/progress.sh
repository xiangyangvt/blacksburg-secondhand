#!/bin/bash
# Sprint 7 Phase 3B 进度监控
# 用法: viddy -n 3 scripts/progress.sh

cd "$(dirname "$0")/.." || exit 1

FILE="SPRINT_7_PROGRESS.md"

if [ ! -f "$FILE" ]; then
  echo "未找到 $FILE — 请在项目根目录跑 viddy"
  exit 1
fi

# 统计 (grep 无匹配返回非 0 exit, 不能用 set -e)
TOTAL=$(grep -E '^- \[[ x~]\]' "$FILE" 2>/dev/null | wc -l | tr -d ' ')
DONE=$(grep -E '^- \[x\]' "$FILE" 2>/dev/null | wc -l | tr -d ' ')
WIP=$(grep -E '^- \[~\]' "$FILE" 2>/dev/null | wc -l | tr -d ' ')
TODO=$((TOTAL - DONE - WIP))

if [ "$TOTAL" -gt 0 ]; then
  PCT=$((DONE * 100 / TOTAL))
else
  PCT=0
fi

# ASCII 进度条
BAR_LEN=30
FILLED=$((PCT * BAR_LEN / 100))
EMPTY=$((BAR_LEN - FILLED))
BAR=""
for i in $(seq 1 $FILLED); do BAR="${BAR}█"; done
for i in $(seq 1 $EMPTY); do BAR="${BAR}░"; done

# 头部
echo ""
echo "  Sprint 7 Phase 3B"
echo "  [${BAR}] ${PCT}%"
echo "  ✓ ${DONE}  ◐ ${WIP}  ○ ${TODO}  / total ${TOTAL}"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 内容带颜色
awk '
  BEGIN {
    RED="\033[31m"; GREEN="\033[32m"; YELLOW="\033[33m";
    GRAY="\033[90m"; RESET="\033[0m"; BOLD="\033[1m"; CYAN="\033[36m";
  }
  /^# / { print BOLD CYAN $0 RESET; next }
  /^## / { print BOLD $0 RESET; next }
  /^### / { print BOLD GRAY $0 RESET; next }
  /^- \[x\]/ { print GREEN $0 RESET; next }
  /^- \[~\]/ { print YELLOW $0 RESET; next }
  /^- \[ \]/ { print GRAY $0 RESET; next }
  /^最后更新/ { print GRAY $0 RESET; next }
  { print }
' "$FILE"
