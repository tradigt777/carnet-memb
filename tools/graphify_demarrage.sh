#!/bin/sh
# Prépare graphify au début d'une session Claude Code :
# 1. installe graphify s'il manque (version fixée) ;
# 2. installe les hooks Git qui mettent le graphe à jour à chaque commit ;
# 3. construit le graphe du code en tâche de fond s'il n'existe pas (local, sans IA).
# Ne bloque jamais la session : toute erreur est ignorée.
VERSION="0.9.103"
cd "$(dirname "$0")/.." || exit 0
if ! command -v graphify >/dev/null 2>&1; then
  pip install -q --break-system-packages "graphifyy[sql]==$VERSION" >/dev/null 2>&1 \
    || pip install -q --user "graphifyy[sql]==$VERSION" >/dev/null 2>&1 \
    || exit 0
fi
command -v graphify >/dev/null 2>&1 || exit 0
grep -q graphify .git/hooks/post-commit 2>/dev/null || graphify hook install >/dev/null 2>&1
if [ ! -f graphify-out/graph.json ]; then
  nohup graphify update . >/tmp/graphify_demarrage.log 2>&1 &
fi
exit 0
