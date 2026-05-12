#!/bin/sh
# Entrypoint for the Relay Proxy + ForgeCode test container.
# Starts the relay proxy in the background, verifies it's healthy,
# then execs the passed command (default: forge).

set -e

RELAY_PORT="${RELAY_PROXY_PORT:-8787}"
PROXY_SCRIPT="/relay/src/run.ts"

echo "[entrypoint] Starting relay proxy on port ${RELAY_PORT}..."

# Start relay proxy in background
bun run "${PROXY_SCRIPT}" proxy start --port "${RELAY_PORT}" &
PROXY_PID=$!

# Give it 2s to bind
sleep 2

# Verify health — fail fast if proxy didn't start
HEALTH_STATUS=$(curl -sf "http://127.0.0.1:${RELAY_PORT}/health" 2>/dev/null || echo '{"status":"error"}')
echo "[entrypoint] Health check: ${HEALTH_STATUS}"

if ! echo "${HEALTH_STATUS}" | grep -q '"status":"ok"'; then
  echo "[entrypoint] ❌ Relay proxy failed to start. Check logs at ~/.claude/relay-proxy.log"
  kill "${PROXY_PID}" 2>/dev/null || true
  exit 1
fi

echo "[entrypoint] ✅ Relay proxy running (pid ${PROXY_PID})"
echo "[entrypoint] Executing: $*"

# Execute the passed command. If nothing passed, drop into a shell for manual inspection.
if [ $# -eq 0 ]; then
  echo "[entrypoint] No command provided — dropping into shell. Try: forge --help"
  exec /bin/sh
fi

exec "$@"