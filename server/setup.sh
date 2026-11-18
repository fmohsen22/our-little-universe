#!/usr/bin/env bash
# Everything on the server in one go: update, restart, nightly backup, the admin login and the emails.
# Run:  cd ~/our-little-universe && bash server/setup.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
ask() { read -r -p "$1 [y/n] " a; [ "$a" = "y" ] || [ "$a" = "Y" ] || [ "$a" = "yes" ]; }
echo "== 1. Getting the latest version"; git pull --ff-only
echo; echo "== 2. Restarting the game and switching on the nightly backup"; bash server/install-service.sh
echo; echo "== 3. Your admin login"
if sudo grep -q '^OWNER_USER=admin$' /etc/our-little-universe.env 2>/dev/null && ! ask "An admin login exists already. Make a new password?"; then echo "Kept the current login."; else bash server/set-owner.sh; fi
echo; echo "== 4. Emails for messages from the contact form"
if sudo grep -q '^MAIL_PASS=' /etc/our-little-universe.env 2>/dev/null && ! ask "Emails are set up already. Set them up again?"; then echo "Kept the current email settings."
elif ask "Set up the emails now? (you need a Gmail app password: https://myaccount.google.com/apppasswords)"; then bash server/set-email.sh || echo "Emails were not set up. Run later: bash server/set-email.sh"
else echo "Skipped. Run later: bash server/set-email.sh"; fi
echo; echo "== Done on the server. Left for you, in the browser:"
echo "  - Sign in at https://game.mosi-app.com/#owner (name: admin) and delete your test accounts."
echo "  - In a private window, try 'Sign up with Google'. If Google blocks it, press 'Publish app' under"
echo "    Google Cloud > APIs & Services > OAuth consent screen."
