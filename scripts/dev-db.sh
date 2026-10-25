#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Grand Suite — local PostgreSQL + Redis without Docker.
# Creates an isolated cluster inside .dev/ (never touches system data).
#   ./scripts/dev-db.sh start|stop|status|reset
# Ports: PostgreSQL 55432 · Redis 56379
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$ROOT/.dev"
PGDATA="$DEV_DIR/pgdata"
PGLOG="$DEV_DIR/postgres.log"
SOCKET_DIR="/tmp/grand-suite-pg-${PGPORT:-55432}"
PGPORT="${PGPORT:-55432}"
REDIS_PORT="${REDIS_PORT:-56379}"
DB_NAME="${DB_NAME:-grandsuite}"
DB_USER="${DB_USER:-grandsuite}"
DB_PASSWORD="${DB_PASSWORD:-grandsuite}"

# Resolve binaries (Homebrew first, then PATH)
find_bin() {
  local name="$1"
  for candidate in \
    "/opt/homebrew/opt/postgresql@16/bin/$name" \
    "/opt/homebrew/opt/postgresql@17/bin/$name" \
    "/usr/local/opt/postgresql@16/bin/$name" \
    "$(command -v "$name" 2>/dev/null || true)"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

PG_CTL="$(find_bin pg_ctl || true)"
INITDB="$(find_bin initdb || true)"
PSQL="$(find_bin psql || true)"
CREATEDB="$(find_bin createdb || true)"
REDIS_SERVER="$(command -v redis-server || true)"

require() {
  if [ -z "${1:-}" ]; then
    echo "✖ Không tìm thấy $2. Cài bằng: brew install $3" >&2
    exit 1
  fi
}

port_open() {
  # bash /dev/tcp check — no extra tooling needed
  (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1 && { exec 3>&-; return 0; } || return 1
}

wait_for_port() {
  local port="$1" tries="${2:-60}"
  for _ in $(seq 1 "$tries"); do
    if port_open "$port"; then return 0; fi
    sleep 0.5
  done
  return 1
}

start_postgres() {
  require "$PG_CTL" "pg_ctl" "postgresql@16"
  require "$INITDB" "initdb" "postgresql@16"
  mkdir -p "$DEV_DIR"

  if "$PG_CTL" -D "$PGDATA" status >/dev/null 2>&1; then
    echo "• PostgreSQL đã chạy (port $PGPORT)"
  else
    if [ ! -d "$PGDATA" ]; then
      echo "• Khởi tạo cluster tại .dev/pgdata …"
      "$INITDB" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
    fi
    mkdir -p "$SOCKET_DIR"
    "$PG_CTL" -D "$PGDATA" -l "$PGLOG" \
      -o "-p $PGPORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" start >/dev/null
    echo "• PostgreSQL khởi động (port $PGPORT)"
  fi

  if ! wait_for_port "$PGPORT"; then
    echo "✖ PostgreSQL không mở port $PGPORT. Xem $PGLOG" >&2
    exit 1
  fi

  # Ensure role + database exist (idempotent)
  if ! "$PSQL" -h 127.0.0.1 -p "$PGPORT" -U postgres -tAc \
      "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    "$PSQL" -h 127.0.0.1 -p "$PGPORT" -U postgres -c \
      "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD' CREATEDB;" >/dev/null
    echo "• Tạo role $DB_USER"
  fi
  if ! "$PSQL" -h 127.0.0.1 -p "$PGPORT" -U postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    "$PSQL" -h 127.0.0.1 -p "$PGPORT" -U postgres -c \
      "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >/dev/null
    echo "• Tạo database $DB_NAME"
  fi
  # Test database used by integration suite
  if ! "$PSQL" -h 127.0.0.1 -p "$PGPORT" -U postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}_test'" | grep -q 1; then
    "$PSQL" -h 127.0.0.1 -p "$PGPORT" -U postgres -c \
      "CREATE DATABASE ${DB_NAME}_test OWNER $DB_USER;" >/dev/null
    echo "• Tạo database ${DB_NAME}_test"
  fi
}

start_redis() {
  if [ -z "$REDIS_SERVER" ]; then
    echo "⚠ Không tìm thấy redis-server — hệ thống vẫn chạy với khoá PostgreSQL dự phòng."
    return 0
  fi
  if port_open "$REDIS_PORT"; then
    echo "• Redis đã chạy (port $REDIS_PORT)"
    return 0
  fi
  mkdir -p "$DEV_DIR/redis"
  "$REDIS_SERVER" --port "$REDIS_PORT" --bind 127.0.0.1 --daemonize yes \
    --dir "$DEV_DIR/redis" --appendonly no --save '' --logfile "$DEV_DIR/redis.log"
  if wait_for_port "$REDIS_PORT" 20; then
    echo "• Redis khởi động (port $REDIS_PORT)"
  else
    echo "⚠ Redis không khởi động được — dùng khoá PostgreSQL dự phòng."
  fi
}

stop_all() {
  if [ -n "$PG_CTL" ] && "$PG_CTL" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PG_CTL" -D "$PGDATA" -m fast stop >/dev/null
    echo "• PostgreSQL đã dừng"
  else
    echo "• PostgreSQL không chạy"
  fi
  if [ -n "$REDIS_SERVER" ] && port_open "$REDIS_PORT"; then
    redis-cli -p "$REDIS_PORT" shutdown nosave >/dev/null 2>&1 || true
    echo "• Redis đã dừng"
  fi
}

status_all() {
  if [ -n "$PG_CTL" ] && "$PG_CTL" -D "$PGDATA" status >/dev/null 2>&1; then
    echo "PostgreSQL: running (127.0.0.1:$PGPORT, db=$DB_NAME)"
  else
    echo "PostgreSQL: stopped"
  fi
  if port_open "$REDIS_PORT"; then echo "Redis: running (127.0.0.1:$REDIS_PORT)"; else echo "Redis: stopped"; fi
}

case "${1:-start}" in
  start)
    start_postgres
    start_redis
    echo "✔ Sẵn sàng. DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:$PGPORT/$DB_NAME"
    ;;
  stop) stop_all ;;
  status) status_all ;;
  reset)
    stop_all
    rm -rf "$PGDATA"
    echo "• Đã xoá cluster. Chạy lại: ./scripts/dev-db.sh start"
    ;;
  *)
    echo "Dùng: $0 {start|stop|status|reset}" >&2
    exit 1
    ;;
esac
