# TicketRush

Billetterie locale : catalogue, comptes et rôles, réservation de 10 minutes, paiement simulé, billets PDF avec QR et contrôle à usage unique.

Le stock est vérifié dans une transaction PostgreSQL sous verrou. Les commandes et confirmations de paiement sont idempotentes. Redis/BullMQ traite l’expiration et les PDF ; une outbox évite de perdre le travail après validation du paiement.

## Démarrage local

Prérequis : Docker Desktop actif, Node.js 26.13.0 et pnpm 10.34.9. Depuis ce dossier :

```powershell
pnpm install --frozen-lockfile
pnpm local:setup
```

Cette commande crée les secrets locaux dans `.env`, prépare PostgreSQL/Redis, les droits SQL, les migrations et les comptes de démonstration. Aucun secret n’est versionné.

Pour démarrer toute l’application dans Docker :

```powershell
docker compose -f compose.yaml -f compose.app.yaml up -d --build --wait
```

Ouvrir [TicketRush](http://127.0.0.1:8080). L’API est accessible sous `/api` et Swagger sous `/api/docs`. Nginx répartit les requêtes sur deux instances API. Les ports exposés sont liés à localhost ; aucune mise en ligne n’est réalisée.

Comptes : `client@ticketrush.local`, `organisateur@ticketrush.local`, `controleur@ticketrush.local`, `admin@ticketrush.local`. Leur mot de passe commun de démonstration est la valeur `DEMO_PASSWORD` du `.env` local. Chaque rôle a son espace dans l’interface. Les événements de démonstration sont renouvelés par `db:seed`.

Pour travailler avec Node sur l’hôte, laisser uniquement PostgreSQL/Redis dans Docker, puis :

```powershell
pnpm build
pnpm local:start
```

Interface : [127.0.0.1:3001](http://127.0.0.1:3001), API : [127.0.0.1:3000/api](http://127.0.0.1:3000/api). Ne pas lancer simultanément les deux modes pour une campagne de mesure. Ctrl+C arrête le lanceur local. Les volumes Docker conservent les données lors d’un arrêt normal.

## Vérifications

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:e2e
pnpm --filter @ticketrush/api pact:consumer
pnpm --filter @ticketrush/notifications pact:provider
```

Les tests d’intégration utilisent de vrais PostgreSQL/Redis. Les commandes Pact s’exécutent dans cet ordre : le test API génère le contrat dans `pacts/`, puis le fournisseur Notifications vérifie ce fichier contre son vrai serveur HTTP et une boîte SQLite éphémère. GitHub Actions rejoue ces deux commandes sur chaque PR avant de construire l’API et l’interface. Le scénario suivant vérifie réellement Nginx → API → fournisseur simulé → webhook → worker → PDF → contrôle, puis retire son événement temporaire :

```powershell
node --env-file=.env scripts/smoke-local.mjs
```

Les résultats et limites des mesures sont consignés dans [le bilan opérations](docs/operations-review.md). Les tests n’attestent pas une capacité de production ni la maîtrise autonome des compétences pédagogiques.

## Supervision locale optionnelle

```powershell
docker compose -f compose.yaml -f compose.app.yaml -f compose.observability.yaml up -d --build --wait
```

- [Grafana](http://127.0.0.1:3002) : utilisateur `admin`, mot de passe `GRAFANA_PASSWORD` dans `.env`, dashboard TicketRush provisionné.
- [Prometheus](http://127.0.0.1:9090) : métriques séparées des deux API.
- [Jaeger](http://127.0.0.1:16686) : traces du service `ticketrush-api`.
- `/api/ops/live` et `/api/ops/ready` : santé du processus et des dépendances.

Les traces restent sur cette machine. Voir [la procédure incident](docs/runbooks/incident.md).

## Périmètre livré et suite

Le MVP fonctionne avec une interface Next.js, NestJS, Prisma/PostgreSQL, Redis/BullMQ, paiement fictif, PDF/QR, administration et contrôle. Cache, SSE, protections de débit, retries/circuit breaker/bulkhead, images Docker et CI sont ajoutés dans le lot opérations.

L’import CSV en flux est disponible dans l’espace organisateur : modèle téléchargeable, brouillons par lots et rapport d’erreurs ([guide](docs/csv-review.md)). Le service notifications/RabbitMQ et la compensation des paiements refusés sont livrés. Les organisateurs peuvent aussi gérer leurs webhooks signés via l'API documentée dans Swagger (`/api/docs`) ; les secrets sont chiffrés et les destinations privées bloquées. L’authentification Google et l’assistant documentaire restent les extensions à réaliser. Aucune transaction bancaire réelle, inscription à un cloud ou dépense n’est nécessaire au fonctionnement local.

## Webhooks sortants

Créer un endpoint avec `POST /api/organizer/webhooks`, lister avec `GET`, renouveler son secret avec `POST /:id/rotate-secret` et supprimer avec `DELETE`. Le secret n’est affiché qu’à sa création ou à son renouvellement : le sauvegarder dans le système destinataire. Chaque envoi `order.paid` comprend `x-ticketrush-event-id`, `x-ticketrush-timestamp` et `x-ticketrush-signature: sha256=…`. La signature HMAC-SHA256 couvre l’horodatage suivi d’un point puis des octets exacts du corps; le récepteur doit vérifier la signature, limiter son âge à cinq minutes et dédupliquer l’identifiant d’événement.

Les endpoints sortants doivent utiliser HTTPS sur le port 443 et résoudre uniquement vers des adresses IP publiques. Le contrôle est répété juste avant l’envoi, l’adresse validée est épinglée à la connexion et les redirections ne sont pas suivies. Ces contrôles protègent les services internes contre les requêtes SSRF.

## Documents

- [Règles métier et critères d’acceptation](docs/user-stories.md)
- [Décisions d’architecture](docs/adr/0004-business-rules.md)
- [ADR notification distribuée](docs/adr/0005-notifications-service.md)
- [ADR compensation et webhooks signés](docs/adr/0006-payment-failure-compensation.md)
- [Webhooks sortants sécurisés](docs/adr/0007-secure-outgoing-webhooks.md)
- [Bilan concurrence, commandes, paiement et livraison](docs/phase-2-3-review.md)
- [Bilan phase 5 — architecture distribuée et résilience](docs/phase-5-review.md)
- [Bilan interface et vérification navigateur](docs/web-review.md)
- [Guide API](apps/api/README.md)
- [Guide interface](apps/web/README.md)
- [Conventions de contribution](CONTRIBUTING.md)

Le code et les commits utilisent l’anglais ; les explications pédagogiques sont en français. Les modifications sont livrées par branches et PR avec contrôles avant fusion.
