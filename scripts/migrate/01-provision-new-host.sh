#!/usr/bin/env bash
# Provision a fresh Linux host to run the Dossier stack.
# RUN ON: the NEW server, as a sudo-capable user (not root).
# Idempotent — safe to re-run.
#
#   ./01-provision-new-host.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/hasmika123/web-ext-job-application-autofill.git}"
CHECKOUT_DIR="${CHECKOUT_DIR:-$HOME/web-ext-job-application-autofill}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

say "OS check"
. /etc/os-release
echo "  $PRETTY_NAME"
case "$VERSION_ID" in
  20.04) warn "Ubuntu 20.04 is EOL — the OLD box ran this. Prefer 22.04/24.04 on the new one." ;;
esac

say "Free port 80 (Caddy needs it for the ACME HTTP-01 challenge)"
# The old VPS shipped with a web server already bound to :80 — catch that before Caddy fails.
for svc in apache2 nginx lighttpd httpd; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    warn "$svc is running and will block Caddy — disabling it"
    sudo systemctl disable --now "$svc"
  fi
done
if sudo ss -lntp 2>/dev/null | grep -qE ':80\s'; then
  warn "Something is STILL listening on :80 — resolve before launching:"
  sudo ss -lntp | grep -E ':80\s' || true
else
  echo "  :80 is free"
fi

say "Install Docker Engine + Compose plugin (official apt repo)"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "  already installed: $(docker --version)"
else
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl gnupg git
  sudo install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  # NOTE: install the plugins explicitly rather than via get.docker.com — that convenience
  # script also pulls docker-model-plugin, which failed to install on the old box.
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
fi

say "Let this user run Docker without sudo (CI cannot answer a sudo prompt)"
if id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  echo "  $USER is already in the docker group"
else
  sudo usermod -aG docker "$USER"
  warn "Group added — you MUST log out and back in before 'docker' works without sudo."
fi

say "Firewall (ufw): allow 22/80/443"
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 22/tcp   >/dev/null
  sudo ufw allow 80/tcp   >/dev/null
  sudo ufw allow 443/tcp  >/dev/null
  sudo ufw --force enable >/dev/null
  sudo ufw status numbered | sed 's/^/  /'
else
  warn "ufw not installed — make sure 22/80/443 are open some other way."
fi
warn "The hosting-panel firewall (IONOS etc.) is SEPARATE from ufw. Open 80+443 there too."

say "Clone the repo on main"
if [ -d "$CHECKOUT_DIR/.git" ]; then
  echo "  already present at $CHECKOUT_DIR"
  git -C "$CHECKOUT_DIR" checkout main
  git -C "$CHECKOUT_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$CHECKOUT_DIR"
  git -C "$CHECKOUT_DIR" checkout main
fi

say "Done. Next: copy .env from the old box (02-dump-old.sh writes it out), then 03-restore-new.sh"
echo "  checkout: $CHECKOUT_DIR"
echo "  public IP: $(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo '<could not detect>')"
