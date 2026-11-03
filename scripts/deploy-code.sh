#!/usr/bin/env bash
# NinhVaNa — deploy source code from Mac/Git to the production Ubuntu host.
# This script NEVER copies, restores, resets or seeds SQL data.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOTE_HOST="${NINHVANA_PROD_HOST:-}"
REMOTE_USER="${NINHVANA_PROD_USER:-ubuntu}"
REMOTE_DIR="${NINHVANA_PROD_DIR:-/opt/ninhvana}"
SSH_KEY="${NINHVANA_SSH_KEY:-$HOME/.ssh/ninhvana-oracle.key}"
TAG="deploy-$(date +%Y%m%d-%H%M%S)"

if [ "${NINHVANA_DEPLOY_CONFIRM:-0}" != "1" ]; then
  echo "✖ Chưa xác nhận deploy."
  echo "  Chạy lại với: NINHVANA_DEPLOY_CONFIRM=1 NINHVANA_PROD_HOST=<IP> $0"
  exit 1
fi
if [ -z "$REMOTE_HOST" ]; then
  echo "✖ Thiếu NINHVANA_PROD_HOST (IP Tailscale/LAN của Ubuntu)." >&2
  exit 1
fi
if [ ! -f "$SSH_KEY" ]; then
  echo "✖ Không thấy SSH key: $SSH_KEY" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "✖ Working tree chưa sạch. Commit/stash trước khi deploy." >&2
  git status --short
  exit 1
fi

echo "→ Kiểm tra local…"
pnpm lint
pnpm typecheck
pnpm test

echo "→ Tạo tag $TAG và push code (không đụng database)…"
git tag -a "$TAG" -m "Production code deploy $TAG"
git push origin main
git push origin "$TAG"

echo "→ Backup database production trên $REMOTE_HOST…"
ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$REMOTE_USER@$REMOTE_HOST" \
  "cd '$REMOTE_DIR' && mkdir -p backups && chmod 700 backups && \
   docker compose exec -T db pg_dump -U grandsuite -d grandsuite -Fc > backups/pre-$TAG.dump && \
   chmod 600 backups/pre-$TAG.dump && \
   sha256sum backups/pre-$TAG.dump > backups/pre-$TAG.dump.sha256 && \
   ls -lh backups/pre-$TAG.dump"

echo "→ Pull đúng tag $TAG và rebuild containers…"
ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$REMOTE_USER@$REMOTE_HOST" \
  "cd '$REMOTE_DIR' && git fetch --tags origin && git reset --hard '$TAG' && \
   docker compose up -d --build"

echo "→ Health check…"
sleep 8
ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$REMOTE_USER@$REMOTE_HOST" \
  "cd '$REMOTE_DIR' && docker compose ps && \
   curl -fsS -o /dev/null -w 'local_web=%{http_code}\\n' http://127.0.0.1:3000/login && \
   curl -fsS -o /dev/null -w 'local_api=%{http_code}\\n' http://127.0.0.1:4000/api/v1/health/live"

echo ""
echo "✔ Deploy code xong. Database không bị copy/reset/seed."
echo "  Backup: $REMOTE_DIR/backups/pre-$TAG.dump"
echo "  Rollback code: git checkout <tag-cũ> && docker compose up -d --build"
