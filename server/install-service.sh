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
ExecStart=$NODE $REPO/server/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now our-little-universe
sleep 1
curl -fsS "http://localhost:$PORT/health" && echo "  <- the server is running on port $PORT, data in $DATA"
