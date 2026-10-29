# ADR 0003 — Outillage du workspace et du socle API

Statut : choix d'outils validés dans la conversation ; mise en œuvre vérifiée, livraison Git en préparation.

## Contexte

Le dépôt doit accueillir plusieurs applications et packages. Le runtime local vérifié est Node.js 26.13.0 LTS ; pnpm 10.34.9 est installé. Le projet exige TypeScript strict, ESM, ESLint et Prettier.

## Décision

- Utiliser pnpm 10.34.9 avec un workspace `apps/*` et `packages/*`, et un lockfile commun à la racine.
- Déclarer Node.js `>=26.13.0 <27` et la version pnpm dans le manifeste. `.nvmrc` indique la version de référence ; il ne change pas automatiquement le runtime sur Windows.
- Initialiser NestJS avec le CLI officiel 12.0.11 en ESM, sans dépôt Git imbriqué ni configuration Observe. Les versions effectivement installées sont enregistrées dans le lockfile.
- Conserver Vitest et Supertest. Remplacer Oxlint fourni par le générateur par ESLint et typescript-eslint, conformément au contexte, avec Prettier pour le formatage.
- Activer TypeScript strict sans désactiver l'initialisation des propriétés ; séparer la compilation applicative des types de tests.
- Exposer des commandes à la racine pour piloter l'API sans changer de répertoire.

## Alternatives considérées

npm workspaces conviendrait aussi ; pnpm a été retenu pour gérer explicitement le monorepo et ses dépendances. CommonJS et Jest étaient proposés par le générateur ; ESM respecte le choix du projet et son option Vitest a été conservée. Oxlint aurait réduit la configuration initiale, mais aurait changé la convention ESLint prévue.

## Conséquences

Les installations reproductibles utilisent `pnpm install --frozen-lockfile`. Les changements de dépendances passent par une revue du manifeste et du lockfile. La racine est privée au sens npm ; le dépôt GitHub reste public.

La validation de configuration se limite actuellement à PORT. Les connexions aux services, comptes applicatifs de base de données, secrets d'authentification et validation de leurs paramètres seront ajoutés avec leurs fonctionnalités.

## Vérifications exécutées

- Installation, puis réinstallation hors ligne avec lockfile figé réussies.
- Typecheck, ESLint, formatage et build réussis.
- 13 tests unitaires, dont les bornes et formats invalides du port ; un test HTTP Supertest réussi.
- Serveur compilé démarré temporairement : GET / retourne HTTP 200 et Hello World!, puis arrêt du serveur.
- Sur cette machine, les tests Vitest et la connexion HTTP réelle ont nécessité l'exécution hors sandbox. Les échecs de permissions de la sandbox ne sont pas présentés comme des défauts métier.

Aucune CI, authentification utilisateur, connexion Prisma ou fonctionnalité métier n'est encore livrée.
