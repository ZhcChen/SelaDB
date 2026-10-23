#!/usr/bin/env bash
# SelaDB 验收脚本。
#
# 跑通「配置 → 连接 → 能力探测 → 服务 → CLI 输出」整条通路,
# 每一步都断言具体内容 —— 不是「命令退出码为 0」那种空验收。
#
# 用法:
#   scripts/acceptance.sh              # 用 debug 二进制
#   BIN=target/release/seladb scripts/acceptance.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${BIN:-$ROOT/target/debug/seladb}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/seladb-acceptance.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
no() { FAIL=$((FAIL + 1)); printf '  \033[31mFAIL\033[0m %s\n     %s\n' "$1" "$2"; }

# assert_contains <名字> <期望子串> <实际>
assert_contains() {
  case "$3" in
    *"$2"*) ok "$1" ;;
    *) no "$1" "期望包含 '$2',实际: $3" ;;
  esac
}

# assert_eq <名字> <期望> <实际>
assert_eq() {
  if [ "$2" = "$3" ]; then ok "$1"; else no "$1" "期望 '$2',实际 '$3'"; fi
}

# assert_contains_not <名字> <不该出现的子串> <实际>
assert_not_contains() {
  case "$3" in
    *"$2"*) no "$1" "不该包含 '$2',但出现了: $3" ;;
    *) ok "$1" ;;
  esac
}

# json_eval <json> <python 表达式> —— 在 JSON 上跑一个表达式,取出一个值。
# JSON 输出是 pretty-print 的,值在单独一行,所以断言必须按值取,不能按子串猜。
json_eval() {
  printf '%s' "$1" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print($2)
" 2>/dev/null
}

if [ ! -x "$BIN" ]; then
  echo "找不到二进制: $BIN" >&2
  echo "先跑 cargo build" >&2
  exit 1
fi

echo "验收目标: $BIN"

# ---------------------------------------------------------------- 准备测试库
DB="$WORK/test.db"
sqlite3 "$DB" "
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT, balance REAL, is_active BOOLEAN);
CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, amount REAL);
INSERT INTO users VALUES (1,'伟','wei@example.com',4320.50,1),(2,'娜',NULL,91.73,0);
INSERT INTO orders VALUES (1,1,99.5),(2,1,250.0);
" || { echo "建测试库失败(需要 sqlite3)" >&2; exit 1; }

URL="sqlite://$DB"

echo
echo "[1] 连接与探活"
out=$("$BIN" --url "$URL" ping 2>&1)
assert_contains "ping 报告引擎" "sqlite" "$out"
out=$("$BIN" --url "$URL" --json ping 2>&1)
assert_contains "ping 的 JSON 标记 ok" '"ok": true' "$out"

echo
echo "[2] 对象列举"
out=$("$BIN" --url "$URL" tables 2>&1)
assert_contains "tables 列出 users" "users" "$out"
assert_contains "tables 列出 orders" "orders" "$out"
out=$("$BIN" --url "$URL" --json tables 2>&1)
assert_contains "tables 的 JSON 带 schema 字段" '"schema"' "$out"

echo
echo "[3] 表结构"
out=$("$BIN" --url "$URL" describe users 2>&1)
assert_contains "describe 报行数" "2 行" "$out"
assert_contains "describe 列出列名" "balance" "$out"
assert_contains "describe 标出主键" "主键" "$out"
assert_contains "describe 标出不可空" "否" "$out"
out=$("$BIN" --url "$URL" --json describe users 2>&1)
assert_contains "describe 的 JSON 有 row_count" '"row_count": 2' "$out"

echo
echo "[4] 查询"
out=$("$BIN" --url "$URL" query "SELECT id, name FROM users ORDER BY id" 2>&1)
assert_contains "query 输出列名 id" "id" "$out"
assert_contains "query 输出中文数据" "伟" "$out"
assert_contains "query 报行数" "(2 行)" "$out"
out=$("$BIN" --url "$URL" --json query "SELECT id, name FROM users ORDER BY id" 2>&1)
assert_contains "query 的 JSON 有 columns" '"columns"' "$out"
assert_contains "query 的 JSON 有 rows" '"rows"' "$out"

echo
echo "[5] 空结果集不是错误"
out=$("$BIN" --url "$URL" query "SELECT id FROM users WHERE id > 999" 2>&1)
assert_contains "空结果显示 0 行" "(0 行)" "$out"
rc=$?
assert_eq "空结果退出码为 0" "0" "$rc"

echo
echo "[6] NULL 与字符串 'NULL' 分得开"
out=$("$BIN" --url "$URL" --json query "SELECT email FROM users WHERE id = 2" 2>&1)
assert_eq "NULL 字段的值是 null" "None" "$(json_eval "$out" "d['data']['rows'][0][0]")"
out=$("$BIN" --url "$URL" --json query "SELECT 'NULL' AS s" 2>&1)
assert_eq "字符串 'NULL' 的值是字符串不是 null" "NULL" "$(json_eval "$out" "d['data']['rows'][0][0]")"

echo
echo "[7] 写操作"
out=$("$BIN" --url "$URL" exec "INSERT INTO users VALUES (3,'强','q@example.com',10.0,1)" 2>&1)
assert_contains "exec 报受影响行数" "rows_affected" "$out"
out=$("$BIN" --url "$URL" --json query "SELECT COUNT(*) AS n FROM users" 2>&1)
assert_eq "写入后行数是 3" "3" "$(json_eval "$out" "d['data']['rows'][0][0]")"

echo
echo "[8] 错误路径"
out=$("$BIN" --url "$URL" query "SELECT FROM WHERE" 2>&1)
rc=$?
assert_eq "坏 SQL 退出码非 0" "1" "$rc"
out=$("$BIN" --url "$URL" --json query "SELECT FROM WHERE" 2>&1)
assert_contains "坏 SQL 的 JSON 标 ok=false" '"ok": false' "$out"
out=$("$BIN" --url "redis://localhost" ping 2>&1)
assert_contains "未接入的引擎明确报错" "尚未接入驱动" "$out"
out=$("$BIN" --url "oracle://h/x" ping 2>&1)
assert_contains "未知引擎明确报错" "未知引擎" "$out"

echo
echo "[9] 能力探测:SQLite 没有 schema 这一层"
out=$("$BIN" --url "$URL" --json schemas 2>&1)
assert_contains "schemas 走降级路径" '"schemas"' "$out"
assert_contains "SQLite 的 schema 列表为空" '[]' "$out"

echo
echo "----------------------------------------"
printf '通过 %d,失败 %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
