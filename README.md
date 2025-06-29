# Transport VHP

Visualisation temps réel des RER, Bus et Vélib autour de l’Hippodrome de Vincennes.

Déploiement :
- Cloudflare Worker pour proxy API PRIM
- GitHub Pages pour l'affichage HTML/CSS/JS

Actualisation toutes les 60 secondes.

## Utilisation en ligne de commande

Un tableau de bord console est fourni via `vhp3_dashboard.py`. Pour l'exécuter avec les données GTFS incluses :

```bash
python vhp3_dashboard.py
```

Le script tente d'interroger l'API temps réel via le proxy Cloudflare. En cas d'échec, il se rabat sur les horaires prévus depuis `data/gtfs/`.
