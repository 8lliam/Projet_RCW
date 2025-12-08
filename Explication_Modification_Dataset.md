# Modifications des datasets initiaux
## Ajouts d'un identifiant pour chaque événement (ligne) du dataset
Dans ce projet, nous avons 2 datasets représentant : 
- les circulations de chaque horaire des RER (de A à D) en 2019
- la régularité de ponctualité quotidiennes des différentes lignes

Afin d'identifier les événements propres aux datasets, nous avons créé une colonne avec le numéro de la ligne comme valeur.

## Suppression des données non renseigné dans les datasets
Dans les datasets des circulations des RER. Nous avons supprimé trois colonnes, car elle possédait toute la valeur '?'. Cela assure une certaine propreté dans les données du graphe. 