#!/usr/bin/env bash
# Finds out why the owner login does not work. Prints no secrets.
# Run on the server:   bash server/check-owner.sh
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-/etc/our-little-universe.env}"
PORT="${PORT:-8787}"
ok() { echo "  OK    $*"; }
bad() { echo "  FIX   $*"; }
echo "Checking the owner login..."

# 1. the code
if grep -q "what === 'owner'" "$REPO/server/server.js"; then ok "the code in $REPO has the owner dashboard"; else bad "the code is too old. Run: cd $REPO && git pull && bash server/install-service.sh"; exit 1; fi

# 2. the saved login
LINE_USER="$(sudo grep '^OWNER_USER=' "$ENV_FILE" 2>/dev/null | tail -1)"; LINE_HASH="$(sudo grep '^OWNER_HASH=' "$ENV_FILE" 2>/dev/null | tail -1)"
OWNER="${LINE_USER#OWNER_USER=}"; HASH="${LINE_HASH#OWNER_HASH=}"
if [ -n "$LINE_USER" ] && [ -n "$LINE_HASH" ]; then ok "a login is saved for the name \"$OWNER\""; else bad "no login is saved yet. Run: bash server/set-owner.sh"; exit 1; fi
if printf '%s' "$HASH" | grep -Eq '^[0-9a-f]{32}:[0-9a-f]{64}$'; then ok "the saved password hash looks right"; else bad "the saved password hash is damaged. Run: bash server/set-owner.sh"; exit 1; fi

# 3. the service reads that file
if systemctl cat our-little-universe 2>/dev/null | grep -q "EnvironmentFile=-$ENV_FILE"; then ok "the service reads $ENV_FILE"; else bad "the service does not read $ENV_FILE. Run: bash server/install-service.sh"; fi

# 4. the running server
REPLY="$(curl -s -m 5 -X POST "http://localhost:$PORT/api/owner/login" -H 'Content-Type: application/json' -d '{"user":"","password":""}')"
case "$REPLY" in
  "") bad "the game server is not answering on port $PORT. Run: bash server/install-service.sh, then: journalctl -u our-little-universe -n 30 --no-pager";;
  *"Sign in first"*|*"not found"*) bad "the running server is an old version. Run: bash server/install-service.sh (it restarts the server)";;
  *"No owner is set up"*) bad "the running server has not loaded the login. Run: sudo systemctl restart our-little-universe";;
  *"Too many attempts"*) bad "too many tries: the login is locked for 15 minutes. Wait, or run: sudo systemctl restart our-little-universe";;
  *"do not match"*) ok "the running server has the owner login loaded";;
  *) echo "  ??    the server answered: $REPLY";;
esac

# 5. the password itself (checked here on the server, never shown or sent anywhere else)
read -r -s -p "Type the owner password to test it (or press Enter to skip): " PW; echo
if [ -n "$PW" ]; then
  MATCH="$(printf '%s' "$PW" | HASH="$HASH" node -e '
    const c = require("crypto"); let pw = ""; process.stdin.on("data", d => pw += d).on("end", () => {
      pw = pw.normalize("NFC").replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0)).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).trim();
      const [s, h] = process.env.HASH.split(":"); c.scrypt(pw, Buffer.from(s, "hex"), 32, (e, k) => process.stdout.write(!e && k.toString("hex") === h ? "yes" : "no")); });')"
  if [ "$MATCH" = "yes" ]; then ok "that password matches the saved one. On the website use the name \"$OWNER\" and this password"; else bad "that password does NOT match the saved one. Set it again with: bash server/set-owner.sh"; fi
fi
unset PW
echo "The dashboard is at https://game.mosi-app.com/#owner"
