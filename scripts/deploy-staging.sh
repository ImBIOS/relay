#!/usr/bin/env bash
set -euo pipefail

# Deploy Relay to staging-0 VPS
# Triggered by: push to master (via GitHub Actions staging.yml)
#
# Required env vars (set in GitHub Secrets):
#   STAGING_HOST    - VPS hostname/IP
#   STAGING_USER    - SSH user
#   STAGING_SSH_KEY - SSH private key
#   STAGING_PORT    - SSH port (default: 22)

HOST="${STAGING_HOST:?STAGING_HOST not set}"
USER="${STAGING_USER:?STAGING_USER not set}"
KEY="${STAGING_SSH_KEY:?STAGING_SSH_KEY not set}"
PORT="${STAGING_PORT:-22}"

# Write SSH key to temp file
SSH_KEY_FILE=$(mktemp)
echo "$KEY" > "$SSH_KEY_FILE"
chmod 600 "$SSH_KEY_FILE"
trap 'rm -f "$SSH_KEY_FILE"' EXIT

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=30 -i $SSH_KEY_FILE -p $PORT"

echo "[staging] Deploying relay to $USER@$HOST:$PORT ..."

# Pull latest, rebuild, and restart the relay proxy
ssh $SSH_OPTS "$USER@$HOST" bash -s <<'DEPLOY'
set -euo pipefail

cd ~/relay 2>/dev/null || {
  echo "[staging] First deploy — cloning repo..."
  git clone https://github.com/ImBIOS/relay.git ~/relay
  cd ~/relay
}

echo "[staging] Pulling latest from master..."
git fetch origin master
git reset --hard origin/master

echo "[staging] Installing dependencies..."
bun install --frozen-lockfile

echo "[staging] Building..."
bun run build

echo "[staging] Restarting relay proxy..."
# If using systemd
if systemctl --user is-active relay-proxy &>/dev/null; then
  systemctl --user restart relay-proxy
  echo "[staging] relay-proxy service restarted"
else
  echo "[staging] No systemd service found. Start manually or set one up."
fi

echo "[staging] Deploy complete!"
DEPLOY

echo "[staging] Done."
