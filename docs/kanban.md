# TicketRush — Kanban

Tableau local de suivi du projet. Les user stories du MVP sont décrites dans [user-stories.md](user-stories.md).

## Règles de fonctionnement

- Flux : Backlog → Ready → In progress → Review → Done.
- Une seule tâche à la fois dans In progress.
- Backlog : travail identifié, mais pas encore prêt à commencer.
- Ready : objectif, critères d'acceptation et règles métier clarifiés ; dépendances satisfaites et approche validée.
- In progress : travail en cours, par petits incréments.
- Review : résultat disponible et vérifications adaptées effectuées ; validation ou corrections en attente.
- Done : résultat revu et validé, avec les vérifications applicables satisfaites. Pour une tâche de code, appliquer la Definition of Done du contexte et le processus de PR dès que le dépôt est configuré.
- Une tâche bloquée garde sa colonne et indique son blocage ; elle ne passe pas dans Done.
- Les tâches documentaires nécessitent une relecture des liens, de la cohérence et du contenu ; elles ne nécessitent pas de tests automatisés.
- Avant chaque nouvelle tâche, suivre le cycle pédagogique et attendre les validations prévues.
- Mettre à jour ce tableau à chaque changement d'état. Aucun transfert vers GitHub Projects n'a encore été effectué.

## Tableau

| Backlog | Ready | In progress | Review | Done |
|---|---|---|---|---|
| — | — | — | P0-06 — Structure du dépôt et README | P0-01 — Cadrer le MVP |
| | | | | P0-02 — Rédiger les 13 user stories |
| | | | | P0-03 — Préparer le Kanban |
| P0-07 — Git, conventions et dépôt distant | | | | P0-04 — ADR : choix de NestJS |
| P0-08 — Docker Compose PostgreSQL et Redis | | | | P0-05 — ADR : monolithe modulaire |
| P0-09 — Vérifier le démarrage et documenter | | | | |
| P0-10 — Bilan et clôture de Phase 0 | | | | |

Les tâches P0-01 à P0-05 ont été validées dans la conversation avant la mise en place du dépôt Git. Leur historique de livraison sera intégré lors de sa configuration. Les [ADR 0001](adr/0001-backend-framework.md) et [ADR 0002](adr/0002-modular-monolith.md) sont acceptés ; la structure et le [README](../README.md) attendent leur revue finale.

## Tâches de Phase 0

| ID | Résultat attendu et critères d'acceptation | Dépendances |
|---|---|---|
| P0-01 | Périmètre du MVP, rôles et règles essentielles validés. | Aucune |
| P0-02 | 10 à 15 user stories avec critères vérifiables ; cas limites et décisions ouvertes identifiés. Résultat : 13 stories validées. | P0-01 |
| P0-03 | Colonnes définies, limite de travail en cours fixée à une tâche, règles de passage explicites, tâches de Phase 0 ordonnées. | P0-02 |
| P0-04 | `docs/adr/0001-backend-framework.md` : contexte, décision, alternatives et conséquences du choix du framework ; validation pédagogique. | P0-03 |
| P0-05 | `docs/adr/0002-modular-monolith.md` : frontières des modules, raisons du monolithe modulaire et compromis ; validation pédagogique. | P0-04 |
| P0-06 | Structure convenue du monorepo et README initial expliquant le projet, les dossiers et les liens vers les documents. Aucun service non implémenté n'est présenté comme fonctionnel. | P0-05 |
| P0-07 | Dépôt Git initialisé, conventions de branches et Conventional Commits documentées, modèle de PR créé ; dépôt distant et protections de main vérifiés selon les capacités du compte et de l'hébergement choisis. Toute limitation est consignée. | P0-06 ; destination du dépôt à préciser |
| P0-08 | Compose pour PostgreSQL et Redis avec volumes, health checks et configuration locale documentée ; aucun secret réel versionné. Versions et outils vérifiés avant implémentation. | P0-07 ; disponibilité de Docker à vérifier |
| P0-09 | `docker compose up -d` démarre les services ; états de santé vérifiés, commandes d'arrêt et de remise en route documentées ; preuve réelle du résultat conservée. | P0-08 |
| P0-10 | Bilan des livrables, preuves, tableau des compétences, points à consolider, README à jour, PR de clôture et tag proposés ; aucune phase suivante commencée sans validation. | P0-09 ; revue de tous les livrables de Phase 0 |

L'ordre ci-dessus est l'ordre de travail proposé. Une tâche en Backlog ne devient pas automatiquement Ready quand la précédente est terminée : son cadrage et son approche doivent aussi être validés.

## Backlog des phases suivantes

| Phase | Stories | Dépendances et points à résoudre |
|---|---|---|
| 1 — Socle | US-01 à US-04 ; socle d'accès de US-11 et US-13 | Phase 0 terminée ; attribution des rôles privilégiés, règles de publication et modération à préciser. |
| 2 — Cohérence et concurrence | US-05 à US-07 | Authentification et catalogue disponibles ; prouver la survente dans la version naïve avant correction ; préciser les transitions et l'expiration. |
| 3 — Paiement et asynchronisme | US-08 à US-12 ; finalisation des interactions de US-13 | Réservations et commandes cohérentes ; heure de référence du paiement, affectation des contrôleurs et effets du retrait d'un événement à préciser. |

Ces regroupements ne constituent pas des tâches prêtes à implémenter. Chaque story sera découpée en petits incréments au moment de sa préparation. Les phases 4 à 7 restent les extensions décrites dans le contexte et seront détaillées après le MVP.

## Vérification de P0-03

- Les cinq colonnes et leurs règles sont présentes.
- Aucune tâche n'est actuellement dans In progress.
- Les dix tâches de Phase 0 ont un résultat attendu et des dépendances.
- Les décisions ouvertes ne sont pas considérées comme résolues.
- Le Kanban a été validé dans la conversation ; P0-03 est dans Done.

Compétences pratiquées : Agile (Kanban, découpage et dépendances), documentation, suivi du travail et communication.
