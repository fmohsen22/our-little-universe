#!/usr/bin/env bash
# Sends every contact-form message to your email, through your Gmail. Your address is stored only on this server
# (in /etc/our-little-universe.env) and is never shown on the website.
#   bash server/set-email.sh        set it up (or change it)
#   bash server/set-email.sh off    stop sending emails (messages still appear on the dashboard)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE=/etc/our-little-universe.env
sudo touch "$ENV_FILE"
if [ "${1:-}" = "off" ]; then
  sudo sed -i '/^MAIL_TO=/d;/^MAIL_USER=/d;/^MAIL_PASS=/d' "$ENV_FILE"; sudo systemctl restart our-little-universe
  echo "Emails are off. Messages still appear on the dashboard."; exit 0
fi
echo "Messages from the contact form will be emailed to you, sent from your own Gmail."
echo
read -r -p "Your email address, where the messages should arrive: " TO
TO="$(printf '%s' "$TO" | tr -d '[:space:]')"
printf '%s' "$TO" | grep -Eq '^[^@]+@[^@]+\.[^@]+$' || { echo "That is not an email address. Nothing was changed."; exit 1; }
read -r -p "The Gmail address that sends them (press Enter if it is the same): " FROM
FROM="$(printf '%s' "${FROM:-$TO}" | tr -d '[:space:]')"
echo
echo "Gmail needs an app password for this (not your normal password):"
echo "  1. Turn on 2-Step Verification:  https://myaccount.google.com/signinoptions/two-step-verification"
echo "  2. Make an app password:         https://myaccount.google.com/apppasswords  (name it: Prince Mohsey game)"
echo "  3. Copy the 16 letters Google shows you."
echo
read -r -s -p "Paste the app password here (it is not shown): " PASS; echo
PASS="$(printf '%s' "$PASS" | tr -d '[:space:]')"
printf '%s' "$PASS" | grep -Eq '^[a-zA-Z]{16}$' || { echo "An app password is 16 letters. Nothing was changed. Copy it again from Google and run this again."; exit 1; }
echo "Sending a test email..."
if ! env MAIL_TO="$TO" MAIL_USER="$FROM" MAIL_PASS="$PASS" node "$REPO/server/mail.js" --test; then
  echo "The test email could not be sent, so nothing was changed. Check the app password and that it belongs to the sending Gmail."; exit 1
fi
sudo sed -i '/^MAIL_TO=/d;/^MAIL_USER=/d;/^MAIL_PASS=/d' "$ENV_FILE"
printf 'MAIL_TO=%s\nMAIL_USER=%s\nMAIL_PASS=%s\n' "$TO" "$FROM" "$PASS" | sudo tee -a "$ENV_FILE" >/dev/null
sudo chmod 600 "$ENV_FILE"
unset PASS
sudo systemctl restart our-little-universe
echo "Done. A test email is on its way to your inbox (look in spam too, the first time)."
echo "From now on every message from the contact form is emailed to you. Your address is not shown anywhere on the website."
