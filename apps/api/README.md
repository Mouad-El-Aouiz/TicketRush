# TicketRush API

API NestJS modulaire en TypeScript strict et ESM. Elle utilise PostgreSQL/Prisma, Redis/BullMQ, RabbitMQ pour les notifications, OpenAPI et Vitest. Le fichier `.env` est à la racine du monorepo.

## Modules

- `auth`, `users` : sessions, rôles et autorisation par objet.
- `events`, `reservations`, `orders` : catalogue, holds, paiements et transitions idempotentes.
- `tickets`, `delivery` : billets PDF/QR, outbox, BullMQ et scan à usage unique.
- `notifications` : passerelle vers le service RabbitMQ et sa boîte de réception locale.
- `webhooks` : endpoints HTTPS signés des organisateurs; les secrets sont chiffrés avec `WEBHOOK_ENCRYPTION_KEY`.
- `imports`, `runtime`, `operations` : import CSV en flux, Redis, santé, métriques et protections de débit.

Swagger est accessible sous `/api/docs`. Les routes de webhook organisateur sont `POST` et `GET /api/organizer/webhooks`, `POST /api/organizer/webhooks/:id/rotate-secret` et `DELETE /api/organizer/webhooks/:id`. Le secret n'est renvoyé qu'à la création ou au renouvellement. Les URLs de destination doivent utiliser HTTPS/443 et résoudre exclusivement vers des IP publiques.

## Configuration et commandes

Depuis la racine du dépôt, préparer l'environnement local une fois :

```powershell
pnpm local:setup
```

Puis les commandes utiles :

```powershell
pnpm --filter @ticketrush/api db:generate
pnpm --filter @ticketrush/api db:migrate
pnpm --filter @ticketrush/api typecheck
pnpm --filter @ticketrush/api lint
pnpm --filter @ticketrush/api format:check
pnpm --filter @ticketrush/api test
pnpm --filter @ticketrush/api test:e2e
```

`pnpm test:e2e` utilise PostgreSQL et Redis locaux. Les tests de cible webhook remplacent le résolveur DNS; les tests d'envoi simulent la réponse HTTPS sans contacter un hôte externe.
