#!/usr/bin/env bash
# Met à jour le carnet avec la dernière version (sauvegarde faite juste avant).
set -euo pipefail
APP_DIR=/opt/carnet-memb
[ "$(id -u)" = 0 ] || { echo "Lance ce script en root."; exit 1; }
cd "$APP_DIR"
sudo -u memb node -e "require('./lib/backup').makeBackup('update').then(r=>console.log('Sauvegarde avant mise à jour :',r.name))" || true
git pull -q && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1 || npm install --omit=dev --no-audit --no-fund >/dev/null
chown -R memb:memb "$APP_DIR"
systemctl restart carnet-memb && sleep 2 && systemctl is-active -q carnet-memb && echo "✔ Carnet mis à jour et redémarré."
