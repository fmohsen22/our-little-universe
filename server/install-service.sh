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
# Private settings for the nightly referee (the OpenAI key) live here, readable only by root and the service.
if [ ! -f /etc/our-little-universe.env ]; then
  sudo tee /etc/our-little-universe.env >/dev/null <<'SETTINGS'
# The nightly referee. Without a key, only the built-in rules are used.
# OPENAI_API_KEY=sk-...
# REFEREE_MODEL=a model your OpenAI account can use
# REFEREE_AT=22:00
# TZ=Europe/Vienna
SETTINGS
  sudo chmod 600 /etc/our-little-universe.env
fi
sudo systemctl daemon-reload
sudo systemctl enable --now our-little-universe
sleep 1
curl -fsS "http://localhost:$PORT/health" && echo "  <- the server is running on port $PORT, data in $DATA"
