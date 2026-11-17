#!/usr/bin/env bash
# Sets the owner login for the admin dashboard (game.mosi-app.com/#owner). The owner is not a player account.
# Run on the server:   bash server/set-owner.sh
# It asks for a name and a password; only a hash of the password is stored, in /etc/our-little-universe.env.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE=/etc/our-little-universe.env
read -r -p "Owner name: " OWNER
OWNER="$(printf '%s' "$OWNER" | tr -d '[:space:]')"
[ -n "$OWNER" ] || { echo "The name cannot be empty."; exit 1; }
read -r -s -p "Password (at least 10 characters): " PW1; echo
read -r -s -p "Same password again: " PW2; echo
[ "$PW1" = "$PW2" ] || { echo "The two passwords are different. Nothing was changed."; exit 1; }
[ "${#PW1}" -ge 10 ] || { echo "Use at least 10 characters. Nothing was changed."; exit 1; }
# the password goes to node on standard input, so it never appears in the process list or the shell history
HASH="$(printf '%s' "$PW1" | node -e '
  const c = require("crypto"); let pw = ""; process.stdin.on("data", d => pw += d).on("end", () => {
    const salt = c.randomBytes(16); c.scrypt(pw, salt, 32, (e, k) => { if (e) throw e; process.stdout.write(salt.toString("hex") + ":" + k.toString("hex")); }); });')"
unset PW1 PW2
sudo touch "$ENV_FILE"
sudo sed -i '/^OWNER_USER=/d;/^OWNER_HASH=/d' "$ENV_FILE"
printf 'OWNER_USER=%s\nOWNER_HASH=%s\n' "$OWNER" "$HASH" | sudo tee -a "$ENV_FILE" >/dev/null
sudo chmod 600 "$ENV_FILE"
sudo systemctl restart our-little-universe 2>/dev/null || true
echo "Done. Sign in as \"$OWNER\" at https://game.mosi-app.com/#owner"
