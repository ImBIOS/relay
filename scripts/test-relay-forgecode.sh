#!/bin/sh
# Convenience script to run Relay Proxy + ForgeCode integration tests inside Docker.
#
# Prerequisites:
#   - bun (to run gen-test-configs.ts)
#   - docker
#   - docker compose plugin
#
# Usage:
#   ./scripts/test-relay-forgecode.sh           # Interactive forge session
#   ./scripts/test-relay-forgecode.sh --forge  # Same, explicit default
#   ./scripts/test-relay-forgecode.sh --smoke  # Proxy health check only, then exit

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RELAY_DIR="${SCRIPT_DIR}/.."  # submodules/relay
COMPOSE_FILE="${SCRIPT_DIR}/../docker-compose.forgecode-test.yml"
# All docker compose invocations must run from the monorepo root so that
# context: .. resolves to the monorepo root (parent of submodules/relay/).
MONOREPO_ROOT="${SCRIPT_DIR}/../../.."  # /home/imbios/dev/projects/alsafa

# ── Colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

info()    { echo "${GREEN}[info]${NC}  $*"; }
warn()    { echo "${YELLOW}[warn]${NC}  $*" >&2; }
error()   { echo "${RED}[error]${NC} $*" >&2; }

# ── Helpers ─────────────────────────────────────────────────────────────────
require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command not found: $1. Install it and try again."
    exit 1
  fi
}

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

# ── Step 0: validate deps ───────────────────────────────────────────────────
info "Validating dependencies..."
require bun
require docker
require curl

# ── Step 1: generate test configs ──────────────────────────────────────────
info "Generating sanitised test configs (ZAI accounts excluded)..."
cd "${RELAY_DIR}"
if ! bun scripts/gen-test-configs.ts; then
  error "gen-test-configs.ts failed. Check the output above."
  exit 1
fi

# ── Step 2: copy forge binary into build context ─────────────────────────────
# The Dockerfile build context is the monorepo root. The forge binary lives on
# the host at ~/.local/bin/forge — copy it into the build context before building.
FORGE_HOST_PATH="${HOME}/.local/bin/forge"
FORGE_DEST="${MONOREPO_ROOT}/submodules/relay/forge"

if [ ! -f "${FORGE_HOST_PATH}" ]; then
  warn "Forge binary not found at ${FORGE_HOST_PATH}"
  warn "Build will succeed but forge won't be functional."
else
  info "Copying forge binary into build context (${FORGE_DEST})..."
  cp "${FORGE_HOST_PATH}" "${FORGE_DEST}"
fi

# ── Step 3: smoke test ──────────────────────────────────────────────────────
smoke() {
  info "Running smoke test..."

  # Use docker build directly (not compose build) so we can explicitly specify
  # the build context as an absolute path. docker compose build derives its
  # context from the compose file location, which is unreliable here.
  DOCKERFILE_PATH="${MONOREPO_ROOT}/submodules/relay/Dockerfile.forgecode"
  info "Building Docker image (context=${MONOREPO_ROOT})..."
  if ! docker build -f "${DOCKERFILE_PATH}" -t relay-proxy-forgecode "${MONOREPO_ROOT}" --quiet 2>&1; then
    error "Docker build failed."
    exit 1
  fi

  # cd to monorepo root so context: .. in compose file resolves to monorepo root
  # Use docker run instead of docker compose up to avoid compose's context validation
  # (the image was built with `docker build` using an explicit absolute context).
  info "Starting container..."
  if ! docker run --rm \
    --name relay-proxy-forgecode \
    -v "${RELAY_DIR}/test-configs/relay-settings.json:/root/.config/relay/settings.json:ro" \
    -v "${RELAY_DIR}/test-configs/forge-credentials.json:/root/forge/.credentials.json:ro" \
    -v "${RELAY_DIR}/test-configs/forge-mcp.json:/root/forge/.mcp.json:ro" \
    -v "${RELAY_DIR}/test-configs/forge.toml:/root/forge/.forge.toml:ro" \
    -e "ANTHROPIC_BASE_URL=http://127.0.0.1:8787/api/anthropic" \
    -e "ANTHROPIC_AUTH_TOKEN=placeholder" \
    -e "RELAY_PROXY_PORT=8787" \
    -e "HOME=/root" \
    --detach \
    relay-proxy-forgecode; then
    error "docker run failed."
    exit 1
  fi

  # Wait for proxy health
  info "Waiting for proxy health endpoint..."
  MAX_WAIT=15
  WAITED=0
  while [ ${WAITED} -lt ${MAX_WAIT} ]; do
    # Use docker exec so curl runs inside the container (no host port mapping needed)
    HEALTH=$(docker exec relay-proxy-forgecode sh -c 'curl -sf http://127.0.0.1:8787/health' 2>/dev/null || echo '{}')
    if echo "${HEALTH}" | grep -q '"status":"ok"'; then
      info "✅ Proxy health: ${HEALTH}"
      break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
  done

  if [ ${WAITED} -ge ${MAX_WAIT} ]; then
    error "Proxy did not become healthy within ${MAX_WAIT}s."
    warn "Dumping proxy log from container:"
    docker stop relay-proxy-forgecode 2>/dev/null || true
    exit 1
  fi

  # Check relay settings inside container — verify no ZAI accounts
  # Check relay settings inside container — verify no ZAI accounts
  # Pattern `provider.*zai` catches any line mentioning both provider and zai.
  # Pattern `provider.*minimax` catches any line mentioning both provider and minimax.
  # Using `|| true` to suppress grep's non-zero exit when no lines match —
  # `grep -c` still outputs the correct integer count (0 or N) in both cases.
  ZAI_COUNT=$(docker exec relay-proxy-forgecode sh -c \
    'grep -c "provider.*zai" /root/.config/relay/settings.json || true')
  if [ "${ZAI_COUNT}" -gt 0 ]; then
    error "ZAI accounts found in container (${ZAI_COUNT} occurrences). This should never happen!"
    docker logs relay-proxy-forgecode 2>&1 | tail -30 || true
    docker stop relay-proxy-forgecode 2>/dev/null || true
    exit 1
  fi
  info "✅ Zero ZAI accounts confirmed in container"
  # Check MiniMax account count — `provider.*minimax` matches 4 account entries plus
  # the root-level `rotation.provider` field (5 total); expect ≥ 4 to pass.
  MM_COUNT=$(docker exec relay-proxy-forgecode sh -c \
    'grep -c "provider.*minimax" /root/.config/relay/settings.json || true')
  info "   MiniMax provider lines in container: ${MM_COUNT} (expected: ≥ 4)"
  if [ "${MM_COUNT}" -lt 4 ]; then
    warn "MiniMax account count mismatch — expected ≥ 4."
  fi
  # Done
  info "Smoke test passed. Tearing down..."
  docker stop relay-proxy-forgecode 2>/dev/null || true
  info "✅ Smoke test complete."
  info "   docker compose -f docker-compose.forgecode-test.yml run --rm relay-proxy-forgecode"
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
case "${1:-}" in
  --smoke|--smoke-only)
    smoke
    ;;
  --forge|"")
    info "Starting interactive ForgeCode session..."
    info "The relay proxy will start automatically inside the container."
    info "Use 'exit' or Ctrl-C to stop.\n"
    compose up --rm relay-proxy-forgecode
    ;;
  --help|-h)
    echo "Usage: $0 [--smoke|--forge|--help]"
    echo ""
    echo "  (default)  Start an interactive forge session inside the test container."
    echo "  --smoke    Build + start + health-check + verify no ZAI keys + stop."
    echo "  --help     Show this message."
    ;;
  *)
    error "Unknown argument: $1"
    echo "Run '$0 --help' for usage."
    exit 1
    ;;
esac