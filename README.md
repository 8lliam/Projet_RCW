# RCW Site - Tableau de bord IDF

Ce projet Django expose le tableau de bord issu du dossier `IDFTransportSite` via l'application `transports`.

## Prerequis
- Python 3 et pip installes (`py --version` sous Windows)
- Un endpoint SPARQL accessible (par defaut `http://localhost:7200/sparql`). Adaptez la constante `SPARQL_ENDPOINT` dans `rcwsite/transports/static/transports/script.js` si besoin.
- (Optionnel) Un environnement virtuel pour isoler les dependances.

## Installation rapide
```bash
cd rcwsite
py -m venv .venv
.venv\\Scripts\\activate
pip install django==6.0
```

## Lancement
```bash
cd rcwsite
py manage.py runserver
```
Puis ouvrez `http://127.0.0.1:8000/`.

## Structure cle
- `rcwsite/transports/templates/transports/index.html` : page principale utilisant Bootstrap et Chart.js.
- `rcwsite/transports/static/transports/style.css` : styles du tableau de bord.
- `rcwsite/transports/static/transports/script.js` : requete SPARQL, transformation des donnees et generation du graphique et de l'analyse.

## Question 1
> Les transports sont-ils de plus en plus fiables au fil des ans ?

## Question 2
> Zones geographiques ou il y a le plus de problemes de transport (RER A/B/C/D)

- La requete `SPARQL_QUERY_ZONES` agrege les retards moyens par gare et par ligne, de-dup sur un label normalise, et recupere les coordonnees `geo:lat` / `geo:long` si presentes dans les donnees.
- La carte Leaflet (Question 2) utilise ces coordonnees. Si elles sont absentes, un fallback pseudo-position est applique. Pour un positionnement correct, charger des TTL avec `geo:lat` et `geo:long` sur chaque ressource `gare:...`.
- Le proxy `/api/sparql` doit pointer vers le repository GraphDB qui contient ces donnees (mettre a jour `SPARQL_ENDPOINT` dans `views.py` si besoin).

## Chargement des donnees (exemple GraphDB)
1. Importer les TTL (ponctualite + rerA/B/C/D + TTL des gares avec geo:lat/geo:long) dans le repository (ex: `idftransport`).
2. Verifier que le SPARQL endpoint repond: `http://localhost:7200/repositories/idftransport?query=ASK%20%7B%7D`.
3. Si vous changez d'URL ou de repo, ajustez `SPARQL_ENDPOINT` dans `rcwsite/transports/views.py` (proxy) ou dans `script.js` si vous bypasser le proxy.
