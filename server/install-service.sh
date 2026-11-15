#!/usr/bin/env bash
# Keeps the room server running in the background and after reboots (systemd).
# Run from the repository folder on your server:   bash server/install-service.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${DATA_DIR:-$HOME/our-little-universe-data}"
ORIGINS="${ALLOWED_ORIGINS:-https://game.mosi-app.com}"
PORT="${PORT:-8787}"
NODE="$(command -v node)"
mkdir -p "$DATA"
sudo tee /etc/systemd/system/our-little-universe.service >/dev/null <<UNIT
[Unit]
Description=Our Little Universe room server
After=network.target

[Service]
User=$USER
WorkingDirectory=$REPO
Environment=PORT=$PORT
Environment=DATA_DIR=$DATA
Environment=ALLOWED_ORIGINS=$ORIGINS
EnvironmentFile=-/etc/our-little-universe.env
ExecStart=$NODE $REPO/server/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
# The nightly referee uses Claude through the Anthropic SDK, which needs Node 20 or newer.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Note: Node $(node -v) runs the game, but the referee needs Node 20 or newer. Until then, rounds wait for the referee."
  echo "      To upgrade on Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
  echo "      then run this script again."
fi
if command -v npm >/dev/null; then (cd "$REPO/server" && npm install --omit=dev --no-audit --no-fund); else echo "Note: npm is missing, so the referee's SDK was not installed."; fi

# Private settings for the nightly referee (the Anthropic API key) live here, readable only by root and the service.
if [ ! -f /etc/our-little-universe.env ] || ! sudo grep -q ANTHROPIC_API_KEY /etc/our-little-universe.env; then
  sudo tee -a /etc/our-little-universe.env >/dev/null <<'SETTINGS'
# The nightly referee is Claude. Without a key, only the built-in instant checks are used.
# ANTHROPIC_API_KEY=sk-ant-...
# REFEREE_AT=22:00
# TZ=Europe/Vienna
SETTINGS
  sudo chmod 600 /etc/our-little-universe.env
fi
sudo systemctl daemon-reload
sudo systemctl enable our-little-universe
sudo systemctl restart our-little-universe   # always pick up the new code
sleep 1
curl -fsS "http://localhost:$PORT/health" && echo "  <- the server is running on port $PORT, data in $DATA"
