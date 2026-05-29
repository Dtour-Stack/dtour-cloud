#!/usr/bin/env bash
#
# Bootstrap a fresh Ubuntu droplet (24.04 LTS recommended; 26.04 LTS also fine)
# to host Detour Cloud. Everything runs in Docker, so the host only needs:
# Docker Engine + Compose v2, a firewall, and swap. Idempotent — safe to re-run.
#
# Run once, as root, on the droplet:
#   ssh root@<droplet-ip> 'bash -s' < deploy/bootstrap.sh
# or copy it over and:  sudo bash bootstrap.sh
#
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (or with sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> System update"
apt-get update -y
apt-get upgrade -y

echo "==> Base packages"
apt-get install -y ca-certificates curl gnupg git ufw

echo "==> Docker Engine + Compose v2"
# Docker's official convenience script — current, handles the Ubuntu codename
# itself, and installs the Compose v2 plugin (`docker compose`).
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Firewall (UFW): SSH + HTTP + HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Swap (2G) — headroom for the frontend build + Convex backend"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Automatic security updates"
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo
echo "✅ Droplet ready."
docker --version
docker compose version
echo "Next: clone the repo + bring up the stack (docker-compose.prod.yml + Caddy)."
