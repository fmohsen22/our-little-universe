#!/usr/bin/env bash
# Saves a dated copy of the game's data (players, daily numbers, messages). Run every night by a timer that
# install-service.sh sets up; keeps the last 30 copies. Run it by hand any time:  bash server/backup.sh
# To restore:  sudo systemctl stop our-little-universe, unpack a copy into the data folder, then start it again.
set -euo pipefail
DATA="${DATA_DIR:-$HOME/our-little-universe-data}"
DEST="${BACKUP_DIR:-$HOME/our-little-universe-backups}"
KEEP="${BACKUP_KEEP:-30}"
[ -f "$DATA/players.json" ] || { echo "No players.json in $DATA yet, nothing to back up."; exit 0; }
mkdir -p "$DEST"; chmod 700 "$DEST"
FILE="$DEST/game-data-$(date +%Y-%m-%d_%H%M).tar.gz"
tar -czf "$FILE" -C "$DATA" $(cd "$DATA" && ls players.json players.json.bak stats.json messages.json 2>/dev/null)
chmod 600 "$FILE"
# keep only the newest $KEEP copies
ls -1t "$DEST"/game-data-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "Saved $FILE ($(du -h "$FILE" | cut -f1)). $(ls -1 "$DEST"/game-data-*.tar.gz | wc -l) copies kept in $DEST"
