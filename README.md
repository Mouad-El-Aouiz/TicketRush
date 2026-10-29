# TicketRush

Projet pédagogique de billetterie pour pratiquer le backend Node.js et TypeScript de niveau intermédiaire, avec les compétences transversales nécessaires à sa livraison et à son exploitation.

Le problème central : réserver et vendre un stock limité de places lors de demandes simultanées, sans survente ni doublons.

## État actuel

Phase 1 — socle de l'API en préparation.

La Phase 0 est validée et clôturée par la PR #3 et le tag `v0.0-foundation`. Le [dépôt public GitHub](https://github.com/Mouad-El-Aouiz/TicketRush) est créé et `main` est protégée. Le socle API est développé sur `chore/api-foundation` ; il reste à livrer par PR.

PostgreSQL et Redis démarrent avec Docker Compose ; santé, authentification et persistance sont vérifiées. L'API NestJS possède une route de démonstration vérifiée ; les autres applications restent des emplacements réservés. Aucune fonctionnalité métier, CI ou application déployée n'existe encore.

## Démarrer le socle API

Utiliser Node.js 26.13.0 et pnpm 10.34.9. Depuis la racine :

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @ticketrush/api start:prod
```

Ouvrir http://127.0.0.1:3000/ : réponse attendue `Hello World!`. Arrêter avec Ctrl+C. `pnpm dev` propose le mode développement avec surveillance des fichiers. Le serveur compilé a été vérifié ; la surveillance n'a pas encore été testée.

Contrôles disponibles : `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` et `pnpm test:e2e`. Résultats : contrôles réussis, 13 tests unitaires et un test HTTP. L'API ne se connecte pas encore aux services de données et ne charge pas le `.env` Compose. Voir le [guide API](apps/api/README.md).

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
| Backend | Node.js, TypeScript strict, NestJS | Socle vérifié : Node.js 26.13.0, TypeScript 6.0.3, NestJS 12.3.2 |
| Architecture | Monolithe modulaire | Validée dans l'ADR 0002 |
| Données | PostgreSQL et Prisma | PostgreSQL local vérifié ; Prisma à configurer |
| Cache et jobs | Redis et BullMQ | Redis local vérifié ; BullMQ à configurer |
| Documentation API | OpenAPI / Swagger | Prévue en Phase 1 |
| Tests | Vitest, Supertest, futurs Testcontainers et scénarios k6 | Premiers tests Vitest/Supertest vérifiés ; tests de données et de charge à venir |
| Livraison | Docker Compose, images multi-stage, GitHub Actions | Compose local vérifié ; images applicatives et CI à préparer |

Les versions et choix de configuration seront vérifiés avant installation. Tout changement structurant sera documenté dans un ADR.

## Organisation du dépôt

```text
TicketRush/
├── apps/
│   ├── api/                 # Socle NestJS vérifié ; métier à construire
│   ├── fake-payment/        # Fournisseur simulé prévu en Phase 3
│   ├── notifications/       # Emplacement pour une éventuelle extraction en Phase 5
│   └── web/                 # Frontend Next.js prévu en Phase 7
├── packages/               # Éléments partagés à introduire selon les besoins
├── infra/                  # Configurations complémentaires à venir
├── scripts/                # Scénarios de concurrence, charge et préparation de données
├── docs/
│   ├── adr/                # Décisions d'architecture
│   ├── runbooks/           # Procédures, dont l'infrastructure locale
│   ├── kanban.md
│   └── user-stories.md
├── compose.yaml            # PostgreSQL et Redis locaux
├── .env.example            # Modèle de configuration sans secrets
├── package.json            # Outils et commandes du workspace
├── pnpm-workspace.yaml     # Applications et packages du monorepo
├── pnpm-lock.yaml          # Versions résolues des dépendances
└── README.md
```

Les fichiers `.gitkeep` permettent de conserver les dossiers encore vides dans Git. Git suit les fichiers, pas les dossiers vides ; `.gitkeep` est une convention sans comportement particulier. Un emplacement réservé ne signifie pas qu'une application y est implémentée.

Le service éventuellement extrait en Phase 5 sera choisi et justifié par un ADR ; le dossier `apps/notifications/` ne décide pas cette extraction à lui seul.

## Documents de référence

- [User stories du MVP et critères d'acceptation](docs/user-stories.md)
- [Kanban et tâches de Phase 0](docs/kanban.md)
- [Conventions de contribution et protections Git](CONTRIBUTING.md)
- [Démarrage, arrêt et vérifications de l'infrastructure locale](docs/runbooks/local-infrastructure.md)
- [Bilan de Phase 0 : livrables, preuves, compétences et exercices](docs/phase-0-review.md)
- [ADR 0001 — Choisir NestJS](docs/adr/0001-backend-framework.md)
- [ADR 0002 — Commencer par un monolithe modulaire](docs/adr/0002-modular-monolith.md)
- [ADR 0003 — Outillage du workspace et de l'API](docs/adr/0003-workspace-tooling.md)

## Méthode de travail

Les explications et documents pédagogiques sont en français ; le code, les noms techniques, les messages d'erreur et les commits sont en anglais.

Chaque tâche avance par petites étapes : compréhension, conception, explication, implémentation, tests adaptés, vérification et clôture. Les étapes clés nécessitent une validation explicite.

Pour les sujets de concurrence, performance et résilience, une version naïve permet d'abord de reproduire et mesurer le problème ; la correction est ensuite vérifiée. Les commits suivront Conventional Commits et les changements passeront par une PR lorsque le dépôt distant sera configuré.

## Prochaines étapes

Revoir et livrer le socle API par PR, puis cadrer la connexion à PostgreSQL et le modèle de données. Les compétences ont été abordées avec accompagnement ; les exercices du bilan de Phase 0 restent disponibles pour une pratique autonome.
