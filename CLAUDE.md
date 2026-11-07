# Consignes pour Claude Code sur ce dépôt

## graphify (graphe du code, pour lire moins de fichiers)

Le graphe est dans `graphify-out/` (non versionné). Il est construit au démarrage de chaque session par `tools/graphify_demarrage.sh` (installation de graphify si besoin, analyse locale du code, sans IA ni clé API, en tâche de fond), puis mis à jour à chaque commit par les hooks Git.

Règles :
- Quand `graphify-out/graph.json` existe, lancer `graphify query "<question>"` avant la première recherche (grep) ou lecture de fichier source sur une question de code, et mettre cette règle dans chaque consigne d'agent qui explore le code. Ne lire les fichiers que pour les lignes que le graphe a localisées. `graphify path "<A>" "<B>"` pour un lien entre deux éléments, `graphify explain "<concept>"` pour un élément précis. Limiter la sortie avec `--budget 800` si besoin.
- Après avoir modifié du code hors commit : `graphify update .` (local, gratuit).
- Si le graphe n'existe pas encore, travailler normalement avec grep et Read.
