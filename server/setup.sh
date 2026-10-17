#!/usr/bin/env bash
# Scent DNA server setup for a fresh Ubuntu 22.04 or 24.04 VPS (for example Contabo).
#
#   sudo bash setup.sh scentdna.owlava.com
#
# Before running: point the domain's DNS A record at this server's IP address,
# so the free HTTPS certificate can be issued.
#
# What it does:
#   - installs PocketBase (accounts, database and photo storage in one program)
#   - downloads the Scent DNA site from GitHub
#   - runs both as a service that starts on boot and restarts if it crashes
#   - gets a free HTTPS certificate for your domain automatically
#   - opens only the SSH, HTTP and HTTPS ports in the firewall
#   - creates your admin login for the PocketBase dashboard
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then echo "Usage: sudo bash setup.sh your-domain.com"; exit 1; fi
if [[ $EUID -ne 0 ]]; then echo "Run this with sudo."; exit 1; fi

PB_VERSION="0.40.5"
REPO="https://github.com/Ibrahim-Mursal/scent-dna.git"
APP="/opt/scentdna"

echo "==> Installing tools"
apt-get update -y
apt-get install -y git unzip curl rsync ufw

echo "==> Creating the scentdna system user"
id scentdna >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin scentdna
mkdir -p "$APP"

echo "==> Downloading the site"
if [[ -d "$APP/repo/.git" ]]; then git -C "$APP/repo" pull --ff-only; else git clone --depth 1 "$REPO" "$APP/repo"; fi
# the public folder gets the site only, never the git history or server files
rsync -a --delete --exclude ".git" --exclude "server" --exclude "tools" --exclude "README.md" --exclude ".htaccess" --exclude "_headers" "$APP/repo/" "$APP/public/"

echo "==> Installing PocketBase $PB_VERSION"
curl -fsSL -o /tmp/pocketbase.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip"
unzip -o /tmp/pocketbase.zip pocketbase -d "$APP"
chmod +x "$APP/pocketbase"
cp "$APP/repo/server/update.sh" "$APP/update.sh"; chmod +x "$APP/update.sh"
chown -R scentdna:scentdna "$APP"

echo "==> Creating the service"
cat > /etc/systemd/system/scentdna.service <<EOF
[Unit]
Description=Scent DNA (PocketBase)
After=network.target

[Service]
Type=simple
User=scentdna
Group=scentdna
LimitNOFILE=4096
Restart=always
RestartSec=5
AmbientCapabilities=CAP_NET_BIND_SERVICE
WorkingDirectory=$APP
ExecStart=$APP/pocketbase serve $DOMAIN --dir $APP/pb_data --publicDir $APP/public --migrationsDir $APP/repo/server/pb_migrations --automigrate=false

[Install]
WantedBy=multi-user.target
EOF
echo "$DOMAIN" > "$APP/domain"

echo "==> Opening the firewall for SSH, HTTP and HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Creating your admin login"
read -rp "Admin email: " ADMIN_EMAIL
read -rsp "Admin password (at least 10 characters): " ADMIN_PASS; echo
sudo -u scentdna "$APP/pocketbase" migrate up --dir "$APP/pb_data" --migrationsDir "$APP/repo/server/pb_migrations" >/dev/null
sudo -u scentdna "$APP/pocketbase" superuser upsert "$ADMIN_EMAIL" "$ADMIN_PASS" --dir "$APP/pb_data"

systemctl daemon-reload
systemctl enable --now scentdna
sleep 5
systemctl --no-pager --lines=5 status scentdna || true

echo
echo "Done. In a minute or two (once the HTTPS certificate is issued):"
echo "  Site:            https://$DOMAIN"
echo "  Admin dashboard: https://$DOMAIN/_/"
echo "Next steps are in server/README.md: email sending, Google sign-in, backups."
