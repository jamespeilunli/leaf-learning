#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_ENV_FILE="$BACKEND_DIR/.env"
API_KEY_PLACEHOLDER="sk-your-key-here"

USE_OPENAI="${ALPHAG3N_USE_OPENAI:-false}"

usage() {
  cat <<'EOF'
Usage: ./run-dev [--openai]

Options:
  --openai  Enable the real OpenAI backend and load OPENAI_API_KEY from backend/.env.
  -h, --help  Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --openai)
      USE_OPENAI=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$USE_OPENAI" == "true" ]]; then
  if [[ ! -f "$BACKEND_ENV_FILE" ]]; then
    echo "Missing $BACKEND_ENV_FILE. Create it with OPENAI_API_KEY before using --openai." >&2
    exit 1
  fi

  set -a
  # backend/.env is the canonical local source for OPENAI_API_KEY in dev.
  source "$BACKEND_ENV_FILE"
  set +a

  if [[ -z "${OPENAI_API_KEY:-}" || "${OPENAI_API_KEY}" == "$API_KEY_PLACEHOLDER" ]]; then
    echo "backend/.env must define a real OPENAI_API_KEY before using --openai." >&2
    exit 1
  fi
fi

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
  ALPHAG3N_USE_OPENAI="$USE_OPENAI" UV_CACHE_DIR=/tmp/uv-cache uv run uvicorn app.main:app --reload --port 8000
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
