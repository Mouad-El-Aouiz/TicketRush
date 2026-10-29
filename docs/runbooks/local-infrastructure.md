# Infrastructure locale PostgreSQL et Redis

## Périmètre et prérequis

Ce guide concerne uniquement l'environnement de développement local. L'API NestJS, Prisma et BullMQ ne sont pas encore installés.

Exécuter les commandes depuis la racine du dépôt, où se trouve `compose.yaml`. Docker Desktop doit être démarré avec son moteur Linux. Vérifier :

```powershell
docker info --format '{{.OSType}}'
docker compose version
```

Le premier résultat attendu est `linux`. Les ports locaux 5432 et 6379 doivent être disponibles ; ils sont configurables dans `.env`.

## Préparer la configuration

Pour une nouvelle installation uniquement, copier le modèle si `.env` n'existe pas encore :

```powershell
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
```

Renseigner dans `.env` deux mots de passe aléatoires distincts : `POSTGRES_PASSWORD` et `REDIS_PASSWORD`. Les valeurs vides du modèle font volontairement échouer la validation. Sur la machine utilisée pendant le projet, `.env` existe déjà avec deux valeurs générées ; il n'est pas nécessaire de le remplacer.

| Variable | Usage |
|---|---|
| `POSTGRES_DB` | Base initiale, `ticketrush` par défaut |
| `POSTGRES_USER` | Utilisateur initial, `ticketrush` par défaut |
| `POSTGRES_PASSWORD` | Mot de passe obligatoire pour PostgreSQL |
| `POSTGRES_PORT` | Port local, 5432 par défaut |
| `REDIS_PASSWORD` | Mot de passe obligatoire pour Redis |
| `REDIS_PORT` | Port local, 6379 par défaut |

Compose lit `.env` pour interpoler sa configuration. Les variables d'environnement du terminal peuvent remplacer ces valeurs. Seules les variables déclarées dans les sections `environment` sont transmises aux services.

`.env` est ignoré par Git ; `.env.example` est versionné sans secrets. Ne pas publier la sortie complète de `docker compose config` ou de `docker inspect`, qui peut révéler la configuration et les mots de passe. Les variables d'environnement ne sont pas un coffre de secrets : elles restent accessibles à une personne autorisée à inspecter Docker localement.

Vérifier sans afficher les valeurs :

```powershell
git check-ignore -v .env
docker compose config --quiet
```

## Démarrer et vérifier

```powershell
docker compose up -d --wait --wait-timeout 120
docker compose ps
```

Les images sont téléchargées au premier lancement. Attendre l'état `healthy` pour les deux services. Les seuls ports publiés sont ceux de la boucle locale `127.0.0.1`, pas ceux de toutes les interfaces réseau.

Pour le développement directement sur Windows, les adresses seront `127.0.0.1:5432` et `127.0.0.1:6379` avec les valeurs par défaut. Un futur conteneur API sur le même réseau utilisera les noms de services `postgres` et `redis`.

Les health checks exécutent `pg_isready` et un `PING` Redis authentifié. Ils vérifient la disponibilité, pas le fonctionnement métier de TicketRush. Les intervalles, délais et tentatives sont décrits dans `compose.yaml`.

## Arrêter, reprendre ou recréer

Arrêter les conteneurs en les conservant :

```powershell
docker compose stop
```

Redémarrer et attendre leur disponibilité :

```powershell
docker compose up -d --wait --wait-timeout 120
```

Supprimer les conteneurs et le réseau du projet, tout en conservant les volumes nommés :

```powershell
docker compose down
```

La même commande `up` recrée ensuite les conteneurs et réutilise les volumes. Ne pas ajouter `--volumes` à `down` si les données doivent être conservées.

## Stockage et limites

- `postgres_data` conserve les fichiers PostgreSQL sous `/var/lib/postgresql` dans l'image PostgreSQL 18.
- `redis_data` conserve les fichiers Redis sous `/data`.
- Redis utilise AOF avec `appendfsync everysec` ; une panne brutale peut perdre environ une seconde d'écritures. Le test ci-dessous couvre une recréation après arrêt propre, pas une coupure électrique.
- Un volume persistant n'est pas une sauvegarde.
- Les tags `postgres:18` et `redis:8` fixent les versions majeures, pas un contenu immuable. Les versions exactes observées lors du test figurent ci-dessous.
- Les variables d'initialisation PostgreSQL s'appliquent à la création d'un volume vide. Modifier le mot de passe dans `.env` ne change pas automatiquement celui d'une base déjà initialisée ; une rotation exige une procédure dédiée.
- L'utilisateur PostgreSQL initial est privilégié. Il sert ici au bootstrap local ; un compte applicatif à privilèges limités devra être défini avant l'utilisation par l'API.

## Résultats vérifiés le 29 octobre 2026

Environnement observé : Docker 29.4.1, Compose 5.1.3, moteur Linux. Versions exécutées : PostgreSQL 18.6 et Redis 8.10.3.

| Vérification exécutée | Résultat |
|---|---|
| `docker compose config --quiet` avec le `.env` local | Configuration valide |
| Exclusion Git de `.env` | Confirmée par `git check-ignore` |
| `up -d --wait` puis `ps` | Deux services `healthy`, ports limités à `127.0.0.1` |
| Connexion PostgreSQL TCP authentifiée depuis son conteneur | Requête retournant la base `ticketrush`, l'utilisateur `ticketrush` et la valeur 1 |
| `PING` Redis avec authentification | `PONG` |
| `PING` Redis sans authentification | `NOAUTH Authentication required.` |
| Écriture d'une ligne PostgreSQL et d'une clé Redis, puis `down` sans suppression des volumes et nouveau `up` | Même valeur `ticketrush-volume-check` retrouvée dans les deux services |
| Comparaison des identifiants de conteneurs | Identifiants différents avant et après : recréation confirmée |
| Nettoyage des données témoins | Table dédiée supprimée et clé dédiée supprimée, sans suppression des volumes |

Les connexions de la future API depuis Windows ne sont pas encore testées. Aucune fonctionnalité métier ni CI n'est annoncée comme validée par ces contrôles.

## Diagnostic rapide

Si Docker ne répond pas, vérifier que Docker Desktop est ouvert et que le moteur Linux a terminé son démarrage. Dans un terminal d'agent restreint, un refus d'accès au canal Docker peut également nécessiter l'autorisation d'exécuter la commande hors sandbox.

Si un port est occupé, choisir un autre port local dans `.env`, puis relancer `up`. Si un service n'est pas sain, consulter localement ses logs et les contrôles de santé ; ne pas partager de sorties contenant des secrets.

Compétences pratiquées : Docker Compose, volumes, réseau, variables d'environnement, contrôles de santé et vérification de la persistance.
