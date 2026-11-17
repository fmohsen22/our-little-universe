#!/usr/bin/env bash
# Turns on "Continue with Google" with your OAuth client ID from Google Cloud (it is public, not a secret).
# Run on the server:   bash server/set-google.sh 1234567890-abc.apps.googleusercontent.com
# To turn it off again: bash server/set-google.sh off
set -euo pipefail
ID="${1:-}"
ENV_FILE=/etc/our-little-universe.env
[ -n "$ID" ] || { echo "Usage: bash server/set-google.sh YOUR-CLIENT-ID.apps.googleusercontent.com"; exit 1; }
if [ "$ID" != "off" ] && ! printf '%s' "$ID" | grep -Eq '^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$'; then echo "That does not look like a Google client ID (it ends in .apps.googleusercontent.com)."; exit 1; fi
sudo touch "$ENV_FILE"
sudo sed -i '/^GOOGLE_CLIENT_ID=/d' "$ENV_FILE"
[ "$ID" = "off" ] || echo "GOOGLE_CLIENT_ID=$ID" | sudo tee -a "$ENV_FILE" >/dev/null
sudo chmod 600 "$ENV_FILE"
sudo systemctl restart our-little-universe 2>/dev/null || true
if [ "$ID" = "off" ]; then echo "Google sign-in is off."; else echo "Google sign-in is on. Open https://game.mosi-app.com and look for Continue with Google."; fi
