# Carnet de suivi MEMB — version en ligne

Application de suivi des enfants accompagnés par Mon enfant, Ma bataille : équipe (super admin, coordinatrice, intervenantes) et familles, chacun avec son compte et son mot de passe.

## Installation sur un VPS (Ubuntu / Debian), en root

```
curl -fsSL https://raw.githubusercontent.com/tradigt777/carnet-memb/main/deploy/install.sh -o install.sh && bash install.sh
```

Le script demande l'adresse du carnet, l'e-mail du super admin et le mot de passe de la boîte e-mail d'envoi, puis installe tout (Node.js, Caddy avec HTTPS automatique, service, pare-feu) et affiche le lien pour choisir le mot de passe du super admin.

## Mise à jour

```
bash /opt/carnet-memb/deploy/update.sh
```

## Où sont les choses

- Application : `/opt/carnet-memb` (réglages dans `.env`, jamais publié)
- Données et photos : `/var/lib/carnet-memb` (base SQLite + dossier `blobs`)
- Sauvegardes automatiques : `/var/lib/carnet-memb/backups` (chaque nuit, 30 jours), téléchargeables depuis le panneau d'administration
- Journal : `journalctl -u carnet-memb -f`

Ce dépôt ne contient aucune donnée d'enfant ni aucun mot de passe.
