# Transport VHP

Visualisation temps réel des RER, Bus et Vélib autour de l’Hippodrome de Vincennes.

Déploiement :
- Cloudflare Worker pour proxy API PRIM
- GitHub Pages pour l'affichage HTML/CSS/JS

Actualisation toutes les 60 secondes.

## Mise à jour du jeu de données GTFS

Le script `vhp3_dashboard.py` charge les fichiers GTFS placés dans `data/gtfs/` pour assurer un repli quand l'appel temps réel échoue. Pour mettre à jour ces informations :

1. Télécharger le dernier jeu de données depuis [Île‑de‑France Mobilités](https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaire-tc-idfm-files/information/).
2. Extraire les fichiers `stops.txt`, `stop_times.txt`, `trips.txt`, `routes.txt` et `calendar.txt`.
3. Remplacer les fichiers correspondants dans `data/gtfs/` en conservant les mêmes noms.

Le script pourra ensuite utiliser les nouveaux horaires en cas d'indisponibilité de l'API temps réel.
