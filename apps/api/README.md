# TicketRush API

Squelette NestJS 12 en TypeScript strict et ESM, avec Vitest, ESLint et Prettier.

## État

Les dépendances sont installées et figées dans le lockfile commun. Le socle utilise NestJS 12.3.2 et TypeScript 6.0.3. Compilation, types, lint, formatage, 13 tests unitaires et un test HTTP passent. Une requête réelle sur le serveur compilé a retourné HTTP 200 avec Hello World! ; le serveur temporaire a ensuite été arrêté.

Prisma, le schéma métier, les modules métier et la validation des variables d'environnement restent à construire. Le .env racine sert à Compose ; il n'est pas chargé automatiquement par cette API.

## Fichiers principaux

- src/main.ts : création de l'application et écoute HTTP.
- src/app.module.ts : composition du module racine.
- src/app.controller.ts : route de démonstration.
- src/app.service.ts : réponse de démonstration.
- src/config/port.ts : validation du port au démarrage ; les valeurs invalides sont refusées.
- src/app.controller.spec.ts : test généré du controller.
- test/app.e2e-spec.ts : test HTTP généré avec Supertest.

## Commandes vérifiées

Depuis la racine du dépôt :

```powershell
pnpm --filter @ticketrush/api typecheck
pnpm --filter @ticketrush/api lint
pnpm --filter @ticketrush/api format:check
pnpm --filter @ticketrush/api build
pnpm --filter @ticketrush/api test
pnpm --filter @ticketrush/api test:e2e
pnpm --filter @ticketrush/api start:dev
```

Les commandes de types, lint, formatage, build et tests ont été exécutées. Le démarrage vérifié utilise start:prod après compilation. start:dev reste une commande de développement à utiliser localement.

L'API écoute sur 127.0.0.1, port 3000 par défaut. PORT peut être fourni dans l'environnement du processus et doit être un entier de 1 à 65535. Le .env de Compose n'est pas chargé automatiquement. Exemple PowerShell : `$env:PORT='3001'` avant le lancement. Retirer cette variable avec `Remove-Item Env:PORT` pour revenir au port par défaut.

Les règles métier et la connexion à PostgreSQL ne sont pas encore implémentées. L'adresse locale fixe devra être adaptée explicitement si l'API est conteneurisée ou déployée.

Ne pas réinitialiser Git ici et ne pas créer de lockfile indépendant de celui du workspace.
