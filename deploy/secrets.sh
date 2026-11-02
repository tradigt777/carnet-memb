#!/usr/bin/env bash
# Met à jour le mot de passe e-mail et/ou la clé API Anthropic dans /docker/carnet-memb/.env,
# sans jamais les afficher, puis redémarre le carnet et vérifie que tout marche.
set -euo pipefail
cd /docker/carnet-memb
maj(){ k="$1"; v="$2"; [ -z "$v" ] && return 0; tmp=$(mktemp); grep -v -E "^#?[[:space:]]*$k=" .env > "$tmp" || true; printf '%s=%s\n' "$k" "$v" >> "$tmp"; cat "$tmp" > .env; rm -f "$tmp"; echo "✔ $k enregistré"; }
read -rsp "Nouveau mot de passe de la boîte contact@ (invisible, Entrée pour ne pas changer) : " P; echo
maj SMTP_PASS "$P"
read -rsp "Clé API Anthropic, commence par sk-ant- (invisible, Entrée pour ne pas changer) : " K; echo
maj ANTHROPIC_API_KEY "$K"
unset P K
echo "Redémarrage du carnet…"
docker compose up -d --force-recreate >/dev/null 2>&1; sleep 15
docker compose exec -T carnet node -e "
const n=require('nodemailer');
n.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:true,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}).verify().then(()=>console.log('✔ E-MAIL OK')).catch(e=>console.log('✘ E-MAIL : '+e.message));
if(!process.env.ANTHROPIC_API_KEY){console.log('— pas de clé Anthropic');}else fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:process.env.AI_MODEL||'claude-sonnet-5-5',max_tokens:10,messages:[{role:'user',content:'Réponds OK'}]})}).then(r=>r.json().then(j=>console.log(r.ok?'✔ IA OK':'✘ IA : '+((j.error&&j.error.message)||r.status)))).catch(e=>console.log('✘ IA : '+e.message));
"
sleep 4; echo FINI
