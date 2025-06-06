
# TransportVHP – Affichage en temps réel des transports autour de l'Hippodrome de Vincennes

## Objectif

Afficher dans une page web unique les horaires **en temps réel** des transports publics desservant l’Hippodrome de Vincennes :
- RER A – station Joinville-le-Pont
- Bus 201 et 77 – École du Breuil et Hippodrome
- Vélib’ – stations proches

## Déploiement
- Proxy Cloudflare Worker : `worker.js`
- Site statique via GitHub Pages : `index.html`, `style.css`, `script.js`

## Zones desservies

| Lieu                    | ZDA ID | Ligne |
|-------------------------|--------|-------|
| Joinville-le-Pont       | 43135  | RER A |
| Hippodrome de Vincennes | 463641 | Bus 77|
| École du Breuil         | 463644 | Bus 201|

## Auteur

Paul Lerosier – Paris, 2025
