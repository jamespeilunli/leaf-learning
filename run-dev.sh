#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

cleanup() {
  local exit_code=$?

  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi

  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

(
  cd "$BACKEND_DIR"
  UV_CACHE_DIR=/tmp/uv-cache uv run uvicorn app.main:app --reload --port 8000
) &
BACKEND_PID=$!

(
  cd "$FRONTEND_DIR"
  npm run dev -- --host 127.0.0.1
) &
FRONTEND_PID=$!

echo "Backend:  http://127.0.0.1:8000"
echo "Frontend: http://127.0.0.1:5173"

wait "$BACKEND_PID" "$FRONTEND_PID"
