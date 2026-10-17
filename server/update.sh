#!/usr/bin/env bash
# Pull the latest Scent DNA site from GitHub and restart. Run on the server:
#   sudo /opt/scentdna/update.sh
set -euo pipefail
APP="/opt/scentdna"
git -C "$APP/repo" pull --ff-only
rsync -a --delete --exclude ".git" --exclude "server" --exclude "tools" --exclude "README.md" --exclude ".htaccess" --exclude "_headers" "$APP/repo/" "$APP/public/"
chown -R scentdna:scentdna "$APP"
systemctl restart scentdna
echo "Updated and restarted."
