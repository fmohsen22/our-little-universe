#!/usr/bin/env bash
# Sets the one owner login for the dashboard at game.mosi-app.com/#owner (it is not a player account).
#   bash server/set-owner.sh   asks for your name and password (shown while you type, so no mistakes),
#                              or makes a strong password for you if you press Enter
# Only a hash of the password is stored, in /etc/our-little-universe.env. Then it tests the login on the running server.
set -euo pipefail
ENV_FILE=/etc/our-little-universe.env
PORT="${PORT:-8787}"
echo "Choose your name and password for the dashboard. Both are shown while you type, so you can check them."
echo "Use English letters (switch the keyboard to English)."
echo
read -r -p "Your name for the dashboard (press Enter for: admin): " OWNER
OWNER="$(printf '%s' "${OWNER:-admin}" | tr -d '[:space:]')"
printf '%s' "$OWNER" | LC_ALL=C grep -q '^[A-Za-z0-9._@-]\{1,60\}$' || { echo "Use only English letters, digits and . _ - @ in the name. Nothing was changed."; exit 1; }
read -r -p "Your password (at least 10 characters; press Enter and one is made for you): " PW
if [ -z "$PW" ]; then
  # 12 random characters in three groups, without look-alikes such as 0/O and 1/l/I
  PW="$(node -e 'const c=require("crypto"),a="abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<12;i++){if(i&&i%4===0)s+="-";s+=a[c.randomInt(a.length)];}process.stdout.write(s)')"
else
  printf '%s' "$PW" | LC_ALL=C grep -q '^[ -~]*$' || { echo "Use English characters only (switch the keyboard to English). Nothing was changed."; exit 1; }
  PW="$(printf '%s' "$PW" | sed 's/^ *//;s/ *$//')"
  [ "${#PW}" -ge 10 ] || { echo "Use at least 10 characters. Nothing was changed."; exit 1; }
fi
# the password goes to node on standard input, so it never appears in the process list or the shell history
HASH="$(printf '%s' "$PW" | node -e '
  const c = require("crypto"); let pw = ""; process.stdin.on("data", d => pw += d).on("end", () => {
    const salt = c.randomBytes(16); c.scrypt(pw.trim(), salt, 32, (e, k) => { if (e) throw e; process.stdout.write(salt.toString("hex") + ":" + k.toString("hex")); }); });')"
sudo touch "$ENV_FILE"
sudo sed -i '/^OWNER_USER=/d;/^OWNER_HASH=/d' "$ENV_FILE"
printf 'OWNER_USER=%s\nOWNER_HASH=%s\n' "$OWNER" "$HASH" | sudo tee -a "$ENV_FILE" >/dev/null
sudo chmod 600 "$ENV_FILE"
sudo systemctl restart our-little-universe

# test the login on the running server, the same way the website does
BODY="$(printf '%s' "$PW" | OWNER="$OWNER" node -e 'let p="";process.stdin.on("data",d=>p+=d).on("end",()=>process.stdout.write(JSON.stringify({user:process.env.OWNER,password:p})))')"
RESULT=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  RESULT="$(curl -s -m 5 -X POST "http://localhost:$PORT/api/owner/login" -H 'Content-Type: application/json' --data-binary @- <<<"$BODY" || true)"
  [ -n "$RESULT" ] && break
done
echo
echo "  Owner dashboard:  https://game.mosi-app.com/#owner"
echo "  Name:             $OWNER"
echo "  Password:         $PW"
echo
case "$RESULT" in
  *'"key":"owner.'*) echo "  Tested: the server accepts this login. Save the password somewhere safe (a password manager); it is not shown again.";;
  *"Too many attempts"*) echo "  The login is saved, but the server is still locked after earlier tries. It was just restarted, so try the website now.";;
  *) echo "  The login is saved, but the test did not pass. The server said: ${RESULT:-nothing (is it running?)}"; echo "  Run: bash server/check-owner.sh";;
esac
unset PW BODY
