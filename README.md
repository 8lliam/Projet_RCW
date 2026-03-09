# RCW Site - Analyse des retards RER / Transilien

Ce projet est une application web statique présentant un tableau de bord sur la ponctualité des transports en Île-de-France (RER et Transiliens). Il exploite des données issues d'un graphe RDF, préalablement exportées au format JSON pour garantir des performances optimales et un hébergement sans serveur (stateless).

## Lancement rapide (Local)

Le projet ne nécessitant aucun backend, il suffit d'un simple serveur HTTP local pour l'exécuter (ce qui évite les blocages de sécurité CORS de votre navigateur lors de la lecture des fichiers JSON).

Si vous avez Python installé sur votre machine :
```bash
cd rcwsite
python -m http.server 8000
```

Puis ouvrez http://localhost:8000/ dans votre navigateur.

(Alternative : Vous pouvez utiliser l'extension "Live Server" sur VS Code ou n'importe quel autre serveur web statique).

## Structure clé

- index.html : Page principale du tableau de bord (interface basée sur Bootstrap, graphiques Chart.js et cartes Leaflet).
- style.css : Feuille de styles du projet.
- script.js : Logique applicative (récupération des données statiques, transformation et rendu visuel).
- Static-Data/ : Dossier contenant les "snapshots" des requêtes SPARQL exportées au format JSON (q1.json, q2.json).

## Axes d'analyse
**Question 1 : Évolution de la fiabilité**
> Les transports sont-ils de plus en plus fiables au fil des ans ? 
> Le graphique trace l'évolution du taux de retard moyen par année et par ligne pour dégager des tendances à long terme.

**Question 2 : Zones géographiques critiques (RER A/B/C/D)**
> Quelles sont les zones où il y a le plus de problèmes de transport ?
> Les cartes (heatmaps et points Leaflet interactifs) utilisent les coordonnées spatiales (geo:lat / geo:long) des gares pour visualiser les hotspots de retard. Si les coordonnées précises sont absentes des données RDF, un algorithme de positionnement alternatif (pseudo-position) répartit les points géographiquement.

## Mise à jour des données (Workflow)

L'architecture étant "stateless", le site n'interroge pas la base de données en direct. Pour mettre à jour les visualisations ou ajouter de nouvelles requêtes SPARQL :

1. Démarrez votre instance GraphDB locale contenant vos données RDF (ponctualite.ttl, rerA/B/C/D.ttl, etc.).
2. Exécutez votre requête SPARQL directement dans l'interface web de GraphDB.
3. Exportez les résultats de la requête au format JSON.
4. Enregistrez ce fichier dans le répertoire Static-Data/ de ce projet.
5. Dans script.js, utilisez l'API fetch() pour pointer vers ce nouveau fichier local.
