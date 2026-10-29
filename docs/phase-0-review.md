# Bilan de Phase 0 — Fondations de TicketRush

Statut : bilan validé et livré par la PR #3, fusionnée au commit `7fa9fd5`. Le tag annoté `v0.0-foundation` a été publié sur ce commit après validation. Les mentions d'attente ci-dessous décrivent la préparation historique de cette clôture.

## Ce qui a été construit

- Un périmètre MVP : places non numérotées, catalogue public, connexion pour réserver, holds de 10 minutes, absence de survente, paiement avant expiration et billet à usage unique.
- [13 user stories](user-stories.md), avec critères d'acceptation et décisions métier encore ouvertes.
- Un [Kanban local](kanban.md), ses règles de passage, ses dépendances et une limite d'une tâche en cours.
- Deux ADR acceptés : [NestJS](adr/0001-backend-framework.md) et [monolithe modulaire](adr/0002-modular-monolith.md).
- Une structure de monorepo, un README, des [conventions de contribution](../CONTRIBUTING.md) et un modèle de PR.
- Un dépôt public GitHub avec `main` protégée : PR obligatoire, résolution des conversations, règles appliquées aux administrateurs, suppressions et push forcés interdits. Aucun approbateur externe ni check CI encore requis.
- Une [configuration Compose](../compose.yaml) PostgreSQL et Redis avec authentification, ports locaux, volumes, health checks et [modèle d'environnement sans secrets](../.env.example).
- Un [guide d'infrastructure locale](runbooks/local-infrastructure.md) documentant les commandes et les vérifications réellement effectuées.

## Critères de sortie et limites

| Critère | État et preuve |
|---|---|
| 10 à 15 user stories rédigées | 13 stories validées dans `docs/user-stories.md` |
| Kanban utilisable | Tableau Markdown versionné ; pas de board GitHub Projects créé |
| Choix structurants documentés | ADR 0001 et 0002 acceptés |
| Dépôt et processus de PR disponibles | PR #1 et #2 fusionnées ; conventions documentées |
| Services démarrables avec Compose | `up -d --wait` exécuté avec succès ; deux services healthy |
| Données persistantes | Données témoins retrouvées après recréation des conteneurs sans suppression des volumes |
| Secrets locaux exclus du dépôt | `.env` ignoré ; `.env.example` versionné avec mots de passe vides |
| Clôture pédagogique et livraison du bilan | En attente de revue et de validation |

La Phase 0 prépare les dépendances de l'application. Elle ne livre ni API NestJS, ni schéma métier, ni tests applicatifs, ni CI. L'absence de survente et la fiabilité des paiements sont des objectifs futurs, pas des résultats déjà démontrés.

## Preuves à conserver

| Preuve | Emplacement |
|---|---|
| Fondation initiale validée | Commit `774abfd` |
| Configuration Git et conventions | [PR #1](https://github.com/Mouad-El-Aouiz/TicketRush/pull/1), commit de fusion `dbb912e` |
| Infrastructure locale et guide de vérification | [PR #2](https://github.com/Mouad-El-Aouiz/TicketRush/pull/2), commit de fusion `821ea4b` |
| Commandes et résultats de santé, authentification et persistance | Section « Résultats vérifiés » du guide d'infrastructure locale |
| Décisions et critères métier | ADR et user stories versionnés |

Les résultats du guide sont un compte rendu des exécutions observées. Aucun script de test automatisé, graphe de charge ou capture de dashboard n'a été produit en Phase 0. Ces preuves seront introduites dans les phases concernées. Aucun chiffre de performance avant/après n'est revendiqué.

## Compétences du PDF couvertes

Les niveaux sont conservateurs : « vu » signifie expliqué ou observé ; « pratiqué » signifie appliqué dans un livrable avec accompagnement. Les commandes et fichiers ont été produits par l'assistant puis examinés et validés avec l'utilisateur. Cela ne démontre pas encore une exécution autonome ni une maîtrise ; aucune compétence n'est déclarée maîtrisée.

| Compétence du référentiel | Niveau de pratique | Preuve dans le dépôt |
|---|---|---|
| Produit — user stories, critères d'acceptation, exigences métier | Pratiqué avec accompagnement | `docs/user-stories.md` et décisions de cadrage |
| Agile — Kanban, découpage et dépendances | Pratiqué avec accompagnement | `docs/kanban.md` |
| Documentation — README, ADR et procédures | Pratiqué avec accompagnement | `README.md`, `docs/adr/`, `docs/runbooks/local-infrastructure.md` |
| Communication — choix et compromis | Pratiqué avec accompagnement | Alternatives et conséquences dans les deux ADR |
| Git en équipe — branches, Conventional Commits et PR | Vu et observé sur le projet | `CONTRIBUTING.md`, modèle de PR et historique Git |
| Code reviews — contrôles documentaires et configuration | Vu | Vérifications décrites dans les PR #1 et #2 |
| Architecture modulaire — responsabilités, couplage et cohésion | Vu | ADR 0002 ; aucun module applicatif implémenté |
| Framework backend et fonctionnement de NestJS | Vu au niveau du choix architectural | ADR 0001 ; injection de dépendances à pratiquer en Phase 1 |
| Docker — Compose, images, conteneurs, volumes et réseaux | Vu et vérifié sur le projet | `compose.yaml` et preuve de recréation dans le guide |
| Configuration et sécurité des API — gestion des secrets | Vu et appliqué à l'environnement local | `.gitignore`, `.env.example`, substitutions obligatoires dans Compose |
| Exploitation — health checks et diagnostic élémentaire | Vu et vérifié sur le projet | Health checks et guide local |
| Langues — français professionnel et anglais technique | Pratiqué avec accompagnement | Documents français, noms techniques et commits anglais |
| Assistants de programmation et vérification du résultat généré | Vu ; pratique autonome à consolider | Historique des revues et vérifications décrites dans les PR |

SQL métier, transactions concurrentes, authentification des utilisateurs, cache applicatif, BullMQ, tests applicatifs et CI restent à pratiquer. Vérifier une connexion aux services ne valide pas ces compétences.

## Points à consolider et exercices courts

| Sujet | Exercice proposé | Résultat attendu |
|---|---|---|
| User stories | Écrire soi-même un scénario nominal et un refus pour US-05, sans code. | Chaque scénario possède un contexte, une action et un résultat observable. |
| Kanban | Expliquer pourquoi une story avec une règle métier ouverte reste dans Backlog. | Distinguer travail identifié et travail prêt à commencer. |
| ADR | Expliquer en trois phrases pourquoi NestJS et monolithe modulaire sont deux décisions distinctes. | Distinguer framework et frontières de déploiement. |
| Git et PR | Avec accompagnement, créer une branche `docs/...`, modifier une phrase utile et préparer un commit puis une PR. | Expliquer la différence entre commit, push et fusion. |
| Docker et volumes | Dessiner le chemin entre Windows, le conteneur PostgreSQL et son volume. Expliquer `stop`, `down` et l'effet de supprimer les volumes. | Comprendre pourquoi remplacer un conteneur peut préserver ses données. |
| Variables et secrets | Expliquer les rôles de `.env` et `.env.example`, puis vérifier l'exclusion avec `git check-ignore -v .env`. | Ne jamais afficher ni publier les vrais mots de passe. |
| Health checks | Comparer « running », « healthy » et « une requête métier fonctionne ». | Identifier la portée réelle de chaque vérification. |
| Limites de la persistance | Expliquer pourquoi le test après arrêt propre ne prouve pas la résistance à une coupure brutale et pourquoi un volume n'est pas une sauvegarde. | Distinguer conservation locale, durabilité et restauration. |

Ces exercices sont proposés ; ils ne sont pas déclarés réalisés et n'impliquent pas une validation automatique de maîtrise.

## Section README

Le README présente désormais les livrables de Phase 0, les deux services disponibles et les liens vers ce bilan et le guide local. La clôture reste indiquée comme en revue tant que ce document et sa livraison ne sont pas validés.

## Tag proposé et conditions de clôture

Tag proposé : `v0.0-foundation`.

Après revue et validation explicite du bilan, livrer sa documentation par PR. Le tag annoté sera créé sur le commit de `main` contenant le bilan accepté, puis publié après autorisation. Aucun tag n'est créé par la rédaction de ce document.

Les tâches P0-08 et P0-09 sont validées et livrées par la PR #2. P0-10 reste en Review. La Phase 1 ne commence pas avant validation de la clôture.

## Préparer la suite

En Phase 1, clarifier progressivement les règles métier nécessaires, puis initialiser l'API par petits incréments. Points déjà connus : attribution des rôles privilégiés, publication et modifications des événements, affectation des contrôleurs et modération. Prévoir aussi un compte PostgreSQL applicatif à privilèges limités avant de connecter l'API.

Aucune nouvelle décision métier n'est prise dans ce bilan.
