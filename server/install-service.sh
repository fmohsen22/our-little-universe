#!/usr/bin/env bash
# Installs the game server as a background service (systemd) and restarts it with the latest code.
# Run from the repository folder on your server:   bash server/install-service.sh
# Then, once:  bash server/set-owner.sh   (your login for the dashboard at game.mosi-app.com/#owner)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${DATA_DIR:-$HOME/our-little-universe-data}"
ORIGINS="${ALLOWED_ORIGINS:-https://game.mosi-app.com}"
PORT="${PORT:-8787}"
NODE="$(command -v node)"
UNIT_FILE=/etc/systemd/system/our-little-universe.service
mkdir -p "$DATA"

sudo tee "$UNIT_FILE" >/dev/null <<UNIT
[Unit]
Description=Where is the Prince? game server
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

# An earlier version installed a nightly referee; the referee is now a player at each table.
if [ -f /etc/systemd/system/our-little-universe-referee.timer ]; then
  sudo systemctl disable --now our-little-universe-referee.timer 2>/dev/null || true
  sudo rm -f /etc/systemd/system/our-little-universe-referee.timer /etc/systemd/system/our-little-universe-referee.service
fi

# a copy of the data every night at 03:17 (or as soon as the computer is on again), keeping 30 days
sudo tee /etc/systemd/system/our-little-universe-backup.service >/dev/null <<UNIT
[Unit]
Description=Where is the Prince? nightly backup

[Service]
Type=oneshot
User=$USER
Environment=DATA_DIR=$DATA
Environment=HOME=$HOME
ExecStart=/usr/bin/env bash $REPO/server/backup.sh
UNIT
sudo tee /etc/systemd/system/our-little-universe-backup.timer >/dev/null <<UNIT
[Unit]
Description=Back up the game's data every night

[Timer]
OnCalendar=*-*-* 03:17
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now our-little-universe-backup.timer
sudo systemctl enable our-little-universe
sudo systemctl restart our-little-universe   # always pick up the new code
sleep 1
curl -fsS "http://localhost:$PORT/health" && echo "  <- the game server is running on port $PORT, data in $DATA"
DATA_DIR="$DATA" bash "$REPO/server/backup.sh" || true   # a first copy right away
if sudo grep -q '^OWNER_HASH=' /etc/our-little-universe.env 2>/dev/null; then echo "Owner dashboard: https://game.mosi-app.com/#owner"; else echo "No owner login yet. Set one with: bash server/set-owner.sh"; fi
