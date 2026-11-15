#!/usr/bin/env bash
# Installs the game server as a background service (systemd) and restarts it with the latest code.
# Run from the repository folder on your server:   bash server/install-service.sh
# To make yourself admin (once; it is remembered):  ADMINS="YourPlayerName" bash server/install-service.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${DATA_DIR:-$HOME/our-little-universe-data}"
ORIGINS="${ALLOWED_ORIGINS:-https://game.mosi-app.com}"
PORT="${PORT:-8787}"
NODE="$(command -v node)"
UNIT_FILE=/etc/systemd/system/our-little-universe.service
# keep the admins from the last install unless new ones are given
if [ -z "${ADMINS+x}" ] && [ -f "$UNIT_FILE" ]; then ADMINS="$(sed -n 's/^Environment="ADMINS=\(.*\)"$/\1/p' "$UNIT_FILE")"; fi
ADMINS="${ADMINS:-}"
mkdir -p "$DATA"

sudo tee "$UNIT_FILE" >/dev/null <<UNIT
[Unit]
Description=Where is Prince Mohsey? game server
After=network.target

[Service]
User=$USER
WorkingDirectory=$REPO
Environment=PORT=$PORT
Environment=DATA_DIR=$DATA
Environment=ALLOWED_ORIGINS=$ORIGINS
Environment="ADMINS=$ADMINS"
EnvironmentFile=-/etc/our-little-universe.env
ExecStart=$NODE $REPO/server/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

# An earlier version installed a nightly referee; the referee is now a player at each table.
if [ -f /etc/systemd/system/our-little-universe-referee.timer ]; then
  sudo systemctl disable --now our-little-universe-referee.timer 2>/dev/null || true
  sudo rm -f /etc/systemd/system/our-little-universe-referee.timer /etc/systemd/system/our-little-universe-referee.service
fi

sudo systemctl daemon-reload
sudo systemctl enable our-little-universe
sudo systemctl restart our-little-universe   # always pick up the new code
sleep 1
curl -fsS "http://localhost:$PORT/health" && echo "  <- the game server is running on port $PORT, data in $DATA"
if [ -n "$ADMINS" ]; then echo "Admins: $ADMINS (sign in on the website and open Admin on the home page)"; else echo "No admin yet. To add one: ADMINS=\"YourPlayerName\" bash server/install-service.sh"; fi
