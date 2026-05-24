#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_MODE="mock"

load_backend_env() {
  local env_file="$ROOT_DIR/backend/.env"

  [[ -f "$env_file" ]] || return 0

  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${key//[[:space:]]/}" ]] && continue

    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$env_file"
}

usage() {
  echo "Usage: ./test.sh [--openai]"
  echo
  echo "By default, backend tests use deterministic mock AI output."
  echo "Use --openai to allow backend tests to call real OpenAI APIs using backend/.env."
}

while (($#)); do
  case "$1" in
    --openai)
      AI_MODE="openai"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$AI_MODE" == "openai" ]]; then
  load_backend_env
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "OPENAI_API_KEY is required in the environment or backend/.env when running ./test.sh --openai" >&2
    exit 2
  fi
fi

echo "Running backend tests..."
(
  cd "$ROOT_DIR/backend"
  if [[ "$AI_MODE" == "openai" ]]; then
    ALPHAG3N_AI_MODE=mock uv run python -m unittest discover -s tests
    echo "Running OpenAI integration tests..."
    ALPHAG3N_AI_MODE=openai ALPHAG3N_TEST_ALLOW_REAL_AI=1 uv run python -m unittest tests.openai_integration
  else
    ALPHAG3N_AI_MODE=mock uv run python -m unittest discover -s tests
  fi
)

echo "Running frontend tests..."
(
  cd "$ROOT_DIR/frontend"
  if [[ ! -x node_modules/.bin/vitest ]]; then
    echo "Installing frontend test dependencies..."
    npm install
  fi
  npm test
)

echo "All tests passed."
