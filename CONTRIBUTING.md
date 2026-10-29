# Contribuer à TicketRush

## Cycle de travail

Préparer une tâche du [Kanban](docs/kanban.md), clarifier ses critères et valider l'approche avant de coder. Limiter le travail en cours à une tâche. Expliquer les choix et faire relire le résultat avant clôture.

## Branches et commits

La branche cible sera `main`. Son existence et sa protection ne sont pas encore configurées.

Utiliser une branche par tâche : `docs/...`, `chore/...`, `feat/...` ou `fix/...`. Les branches créées par Codex utilisent le préfixe `codex/`, par exemple `codex/docs-project-foundation`.

Utiliser Conventional Commits, avec un message en anglais :

```text
docs(adr): document modular monolith architecture
feat(reservations): add temporary ticket holds
fix(payments): reject duplicate payment transitions
```

Garder les changements cohérents et relire le diff avant de committer. Ne pas ajouter de secrets, de fichiers `.env` réels ou de données personnelles de test.

## Pull requests

Une PR est obligatoire pour chaque tâche dès que le dépôt distant et une branche de base sont disponibles. Le premier commit de base nécessaire à l'ouverture des PR sera documenté séparément lors de l'initialisation.

Utiliser le modèle de PR : contexte, changements, validations réellement effectuées et risques. Procéder à une revue même en travaillant seul. Ne pas présenter une auto-revue comme l'approbation d'un autre contributeur.

Les protections seront configurées selon les possibilités du dépôt public. Ne pas imposer un approbateur externe indisponible dans ce projet individuel. Les checks CI obligatoires seront ajoutés lorsqu'ils existeront et auront été vérifiés.

## Vérifications

Pour les documents : relire le contenu, vérifier les liens et la cohérence avec les décisions validées.

Pour le code : appliquer la Definition of Done du projet, dont compilation stricte, validation des entrées, autorisation, tests adaptés, logs sans données sensibles et documentation. Les commandes seront documentées lorsqu'elles auront été configurées et exécutées.

Les explications pédagogiques sont en français ; le code, les commits et les messages d'erreur sont en anglais.
