#!/usr/bin/env bash
# Makes your personal sign-in link for the dashboard: open it and you are signed in, nothing to type.
# Run on the server:   bash server/owner-link.sh
# Making a new link switches the old one off. Keep the link private, like a password.
set -euo pipefail
ENV_FILE=/etc/our-little-universe.env
PORT="${PORT:-8787}"
TOKEN="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
HASH="$(printf '%s' "$TOKEN" | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>process.stdout.write(require("crypto").createHash("sha256").update(t).digest("hex")))')"
sudo touch "$ENV_FILE"
sudo sed -i '/^OWNER_LINK=/d' "$ENV_FILE"
echo "OWNER_LINK=$HASH" | sudo tee -a "$ENV_FILE" >/dev/null
sudo chmod 600 "$ENV_FILE"
sudo systemctl restart our-little-universe
RESULT=""
for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; RESULT="$(curl -s -m 5 -X POST "http://localhost:$PORT/api/owner/link" -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}" || true)"; [ -n "$RESULT" ] && break; done
echo
echo "  Your sign-in link for the dashboard:"
echo
echo "  https://game.mosi-app.com/#owner-$TOKEN"
echo
case "$RESULT" in
  *'"key":"owner.'*) echo "  Tested: it works. Open it on your phone or computer (send it to yourself, or bookmark it)."; echo "  Keep it private, like a password. Running this again makes a new link and switches this one off.";;
  *) echo "  The link is saved, but the test did not pass. The server said: ${RESULT:-nothing (is it running?)}";;
esac
