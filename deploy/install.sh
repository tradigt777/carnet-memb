#!/usr/bin/env bash
# Installation du Carnet de suivi MEMB sur un VPS Ubuntu / Debian (à lancer en root).
# Installe Node.js, Caddy (HTTPS automatique), l'application, le service et le pare-feu.
set -euo pipefail
REPO="${REPO:-https://github.com/tradigt777/carnet-memb.git}"
APP_DIR=/opt/carnet-memb
DATA_DIR=/var/lib/carnet-memb
OWNER_ID="u__wQF5fpYamMppe3qkgpTOA"

bleu(){ printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
ok(){ printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
stop(){ printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }
[ "$(id -u)" = 0 ] || stop "Lance ce script en root (ou avec sudo)."
command -v apt-get >/dev/null || stop "Ce script est prévu pour Ubuntu ou Debian."

bleu "Quelques réglages (Entrée = valeur proposée)"
read -rp "Adresse du carnet [suivi.mychildmybattle.com] : " DOMAIN; DOMAIN=${DOMAIN:-suivi.mychildmybattle.com}
read -rp "E-mail du super admin (ton identifiant) [contact@mychildmybattle.com] : " OWNER_EMAIL; OWNER_EMAIL=${OWNER_EMAIL:-contact@mychildmybattle.com}
read -rp "Ton nom affiché [Hasan] : " OWNER_NAME; OWNER_NAME=${OWNER_NAME:-Hasan}
read -rp "Boîte qui envoie les e-mails [contact@mychildmybattle.com] : " SMTP_USER; SMTP_USER=${SMTP_USER:-contact@mychildmybattle.com}
echo "Mot de passe de cette boîte e-mail (il ne s'affiche pas quand tu tapes ; Entrée pour passer et le faire plus tard) :"
read -rs SMTP_PASS; echo

bleu "Vérification du serveur"
if ss -ltnp 2>/dev/null | grep -E ':(80|443)\s' | grep -vq caddy; then
  ss -ltnp | grep -E ':(80|443)\s' || true
  stop "Un autre logiciel (nginx, apache…) utilise déjà les ports web 80/443 de ce VPS. Dis-le à Claude : il adaptera l'installation pour cohabiter."
fi
ok "Ports web libres"

bleu "Installation des logiciels (2 à 4 minutes)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg ufw build-essential python3 debian-keyring debian-archive-keyring apt-transport-https dnsutils >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
ok "Node.js $(node -v)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
ok "Caddy $(caddy version | cut -d' ' -f1)"

bleu "Installation de l'application"
id memb >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin memb
if [ -d "$APP_DIR/.git" ]; then git -C "$APP_DIR" pull -q; else rm -rf "$APP_DIR"; git clone -q "$REPO" "$APP_DIR"; fi
cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1 || npm install --omit=dev --no-audit --no-fund >/dev/null
mkdir -p "$DATA_DIR"
if [ ! -f "$APP_DIR/.env" ]; then
  umask 077
  cat > "$APP_DIR/.env" <<EOF
PORT=3000
BASE_URL=https://$DOMAIN
DATA_DIR=$DATA_DIR
OWNER_EMAIL=$OWNER_EMAIL
OWNER_NAME=$OWNER_NAME
OWNER_ID=$OWNER_ID
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=$SMTP_USER
BACKUP_KEEP_DAYS=30
# Pour activer l'assistant IA (dictée rangée automatiquement), ajoute ta clé :
# ANTHROPIC_API_KEY=
EOF
  umask 022
fi
chown -R memb:memb "$APP_DIR" "$DATA_DIR"; chmod 600 "$APP_DIR/.env"
ok "Application installée dans $APP_DIR, données dans $DATA_DIR"

cat > /etc/systemd/system/carnet-memb.service <<EOF
[Unit]
Description=Carnet de suivi MEMB
After=network.target
[Service]
User=memb
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable -q --now carnet-memb && systemctl restart carnet-memb
ok "Service démarré (redémarre tout seul en cas de souci ou de redémarrage du VPS)"

bleu "Adresse web et HTTPS"
mkdir -p /etc/caddy/sites
cat > /etc/caddy/sites/carnet-memb.caddy <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
	request_body {
		max_size 400MB
	}
}
EOF
grep -q 'import sites/\*' /etc/caddy/Caddyfile 2>/dev/null || { [ -s /etc/caddy/Caddyfile ] && grep -q ':80' /etc/caddy/Caddyfile && echo -n > /etc/caddy/Caddyfile; echo 'import sites/*' >> /etc/caddy/Caddyfile; }
systemctl enable -q caddy && systemctl reload caddy 2>/dev/null || systemctl restart caddy
ok "Caddy configuré pour $DOMAIN"

ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
ok "Pare-feu actif (SSH, web)"

IP=$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')
DNS=$(dig +short A "$DOMAIN" | tail -1)
sleep 3
bleu "Résultat"
if [ "$DNS" = "$IP" ]; then ok "Le domaine $DOMAIN pointe bien vers ce VPS ($IP)"; else
  echo "⚠ Le domaine $DOMAIN ne pointe pas encore vers ce VPS."
  echo "  Dans Hostinger › Domaines › mychildmybattle.com › DNS, ajoute un enregistrement :"
  echo "  Type A · Nom : ${DOMAIN%%.mychildmybattle.com} · Pointe vers : $IP · TTL : 300"
  echo "  Le cadenas HTTPS s'activera tout seul quelques minutes après."
fi
systemctl is-active -q carnet-memb && ok "Le carnet tourne" || { journalctl -u carnet-memb -n 20 --no-pager; stop "Le carnet ne démarre pas (voir ci-dessus)."; }
if [ -f "$DATA_DIR/premier-lien.txt" ]; then
  echo; echo "👉 Ouvre ce lien pour choisir TON mot de passe de super admin (valable 7 jours) :"
  echo; cat "$DATA_DIR/premier-lien.txt"; echo
fi
echo "Installation terminée. Mise à jour plus tard : bash $APP_DIR/deploy/update.sh"
