#!/usr/bin/env bash
# Installation du Carnet MEMB sur un VPS qui a déjà Docker + Traefik (modèle n8n de Hostinger).
set -euo pipefail
DIR=/docker/carnet-memb
RAW=https://raw.githubusercontent.com/tradigt777/carnet-memb/main/deploy
ok(){ printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
mkdir -p "$DIR/data" && cd "$DIR"
curl -fsSL "$RAW/docker-compose.yml" -o docker-compose.yml
if [ ! -f .env ]; then
  read -rp "Adresse du carnet [suivi.mychildmybattle.com] : " DOMAIN; DOMAIN=${DOMAIN:-suivi.mychildmybattle.com}
  read -rp "E-mail du super admin [contact@mychildmybattle.com] : " OWNER_EMAIL; OWNER_EMAIL=${OWNER_EMAIL:-contact@mychildmybattle.com}
  read -rp "Nom affiché du super admin [Hasan] : " OWNER_NAME; OWNER_NAME=${OWNER_NAME:-Hasan}
  read -rp "Boîte qui envoie les e-mails [contact@mychildmybattle.com] : " SMTP_USER; SMTP_USER=${SMTP_USER:-contact@mychildmybattle.com}
  echo "Mot de passe de cette boîte e-mail (invisible quand tu tapes ; Entrée pour le faire plus tard) :"; read -rs SMTP_PASS; echo
  umask 077
  cat > .env <<ENV
DOMAIN=$DOMAIN
BASE_URL=https://$DOMAIN
OWNER_EMAIL=$OWNER_EMAIL
OWNER_NAME=$OWNER_NAME
OWNER_ID=u__wQF5fpYamMppe3qkgpTOA
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=$SMTP_USER
BACKUP_KEEP_DAYS=30
# ANTHROPIC_API_KEY=
ENV
  umask 022
fi
chown -R 1000:1000 data
echo "Construction et démarrage (2 à 4 minutes)…"
docker compose up -d --build
for i in $(seq 1 30); do [ -f data/premier-lien.txt ] && break; sleep 2; done
docker compose ps
ok "Carnet démarré"
if [ -f data/premier-lien.txt ]; then echo; echo "👉 Lien pour choisir le mot de passe du super admin (valable 7 jours) :"; echo; cat data/premier-lien.txt; echo; fi
echo "Mise à jour plus tard :  cd $DIR && docker compose build --pull && docker compose up -d"
