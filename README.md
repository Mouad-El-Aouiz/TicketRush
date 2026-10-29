# TicketRush

Projet pédagogique de billetterie pour pratiquer le backend Node.js et TypeScript de niveau intermédiaire, avec les compétences transversales nécessaires à sa livraison et à son exploitation.

Le problème central : réserver et vendre un stock limité de places lors de demandes simultanées, sans survente ni doublons.

## État actuel

Phase 0 — cadrage et préparation du dépôt.

Le cadrage, les 13 user stories, le Kanban, les deux premiers ADR, l'arborescence et le README initial ont été validés. Le [dépôt public GitHub](https://github.com/Mouad-El-Aouiz/TicketRush) est créé et `main` est protégée. La configuration Git et les conventions sont en revue ; Docker Compose reste à préparer.

Aucune application, base de données ou infrastructure n'est encore configurée. Les dossiers d'applications sont des emplacements réservés. Il n'existe pas encore de commande de démarrage, de résultat de tests, de CI ou de déploiement à utiliser.

## MVP prévu — Phases 0 à 3

- Catalogue public d'événements et catégories de places non numérotées.
- Comptes et accès selon les rôles CLIENT, ORGANISATEUR, CONTROLEUR et ADMIN, avec contrôle de l'appartenance des ressources.
- Connexion obligatoire pour réserver ; réservation temporaire de 10 minutes.
- Gestion du stock sous concurrence, expiration des réservations et commandes idempotentes.
- Paiement simulé avec webhooks signés et traitement des événements rejoués.
- Un billet PDF avec QR code par place achetée ; un seul scan accepté par billet.
- Traitements asynchrones avec reprises sur erreur et suivi des échecs.

Un paiement doit être confirmé avant expiration pour valider la commande. Une confirmation tardive ne délivre aucun billet et entraîne une annulation ou un remboursement simulé.

Les montants sont exprimés en centimes et les dates enregistrées en UTC. Les décisions métier encore ouvertes sont signalées dans les user stories et seront résolues avant l'implémentation concernée.

## Choix techniques

| Élément | Choix ou cible | État |
|---|---|---|
| Backend | Node.js, TypeScript strict, NestJS | Framework validé dans l'ADR 0001 ; versions à fixer lors de l'initialisation |
| Architecture | Monolithe modulaire | Validée dans l'ADR 0002 |
| Données | PostgreSQL et Prisma | Cible du projet ; pas encore configurée |
| Cache et jobs | Redis et BullMQ | Cible du projet ; pas encore configurée |
| Documentation API | OpenAPI / Swagger | Prévue en Phase 1 |
| Tests | Tests unitaires, Supertest, Testcontainers et scénarios k6 | Outils à installer et configurer aux étapes concernées |
| Livraison | Docker Compose, images multi-stage, GitHub Actions | À préparer progressivement |

Les versions et choix de configuration seront vérifiés avant installation. Tout changement structurant sera documenté dans un ADR.

## Organisation du dépôt

```text
TicketRush/
├── apps/
│   ├── api/                 # API NestJS à construire
│   ├── fake-payment/        # Fournisseur simulé prévu en Phase 3
│   ├── notifications/       # Emplacement pour une éventuelle extraction en Phase 5
│   └── web/                 # Frontend Next.js prévu en Phase 7
├── packages/               # Éléments partagés à introduire selon les besoins
├── infra/                  # Configuration d'infrastructure à venir
├── scripts/                # Scénarios de concurrence, charge et préparation de données
├── docs/
│   ├── adr/                # Décisions d'architecture
│   ├── runbooks/           # Procédures d'exploitation à venir
│   ├── kanban.md
│   └── user-stories.md
└── README.md
```

Les fichiers `.gitkeep` permettent de conserver les dossiers encore vides dans Git. Git suit les fichiers, pas les dossiers vides ; `.gitkeep` est une convention sans comportement particulier. Un emplacement réservé ne signifie pas qu'une application y est implémentée.

Le service éventuellement extrait en Phase 5 sera choisi et justifié par un ADR ; le dossier `apps/notifications/` ne décide pas cette extraction à lui seul.

## Documents de référence

- [User stories du MVP et critères d'acceptation](docs/user-stories.md)
- [Kanban et tâches de Phase 0](docs/kanban.md)
- [Conventions de contribution et protections Git](CONTRIBUTING.md)
- [ADR 0001 — Choisir NestJS](docs/adr/0001-backend-framework.md)
- [ADR 0002 — Commencer par un monolithe modulaire](docs/adr/0002-modular-monolith.md)

## Méthode de travail

Les explications et documents pédagogiques sont en français ; le code, les noms techniques, les messages d'erreur et les commits sont en anglais.

Chaque tâche avance par petites étapes : compréhension, conception, explication, implémentation, tests adaptés, vérification et clôture. Les étapes clés nécessitent une validation explicite.

Pour les sujets de concurrence, performance et résilience, une version naïve permet d'abord de reproduire et mesurer le problème ; la correction est ensuite vérifiée. Les commits suivront Conventional Commits et les changements passeront par une PR lorsque le dépôt distant sera configuré.

## Prochaines étapes

Après revue de la configuration Git : préparer PostgreSQL et Redis avec Docker Compose. Les prérequis et commandes de démarrage seront ajoutés après vérification réelle du fonctionnement.
