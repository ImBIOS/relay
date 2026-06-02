#!/usr/bin/env bash
set -euo pipefail

# Deploy Relay to prod-0 VPS
# Triggered by: manual workflow_dispatch on release/* branches (via release.yml)
#
# Required env vars (set in GitHub Secrets):
#   PROD_HOST    - VPS hostname/IP
#   PROD_USER    - SSH user
#   PROD_SSH_KEY - SSH private key
#   PROD_PORT    - SSH port (default: 22)

HOST="${PROD_HOST:?PROD_HOST not set}"
USER="${PROD_USER:?PROD_USER not set}"
KEY="${PROD_SSH_KEY:?PROD_SSH_KEY not set}"
PORT="${PROD_PORT:-22}"

# Write SSH key to temp file
SSH_KEY_FILE=$(mktemp)
echo "$KEY" > "$SSH_KEY_FILE"
chmod 600 "$SSH_KEY_FILE"
trap 'rm -f "$SSH_KEY_FILE"' EXIT

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=30 -i $SSH_KEY_FILE -p $PORT"

echo "[prod] Deploying relay to $USER@$HOST:$PORT ..."

# Pull the release branch, rebuild, and restart
ssh $SSH_OPTS "$USER@$HOST" bash -s <<'DEPLOY'
set -euo pipefail

cd ~/relay 2>/dev/null || {
  echo "[prod] First deploy — cloning repo..."
  git clone https://github.com/ImBIOS/relay.git ~/relay
  cd ~/relay
}

BRANCH="${RELEASE_BRANCH:-release/$(git describe --tags --abbrev=0 2>/dev/null || echo latest)}"
echo "[prod] Checking out $BRANCH..."
git fetch origin
git reset --hard "origin/$BRANCH" 2>/dev/null || {
  echo "[prod] Branch $BRANCH not found, falling back to latest tag or master"
  git reset --hard origin/master
}

echo "[prod] Installing dependencies..."
bun install --frozen-lockfile

echo "[prod] Building..."
bun run build

echo "[prod] Restarting relay proxy..."
# If using systemd
if systemctl --user is-active relay-proxy &>/dev/null; then
  systemctl --user restart relay-proxy
  echo "[prod] relay-proxy service restarted"
else
  echo "[prod] No systemd service found. Start manually or set one up."
fi

echo "[prod] Deploy complete!"
DEPLOY

echo "[prod] Done."
