# ADR 0008 — Vérifier le contrat HTTP de Notifications avec Pact

## Contexte

Le message RabbitMQ `TICKETS_READY` est déjà versionné et validé avec le schéma Zod partagé. L’API lit aussi la boîte de réception du service Notifications via HTTP. Le type Zod vérifie la réponse après réception, mais ne prouve pas que le service fournit la route, le statut et les en-têtes attendus par son consommateur.

## Décision

L’API produit un contrat Pact V4 versionné dans `pacts/`. Un test consommateur exécute le vrai client `Notifications.list()` contre le serveur mock Pact. Un test fournisseur démarre le serveur HTTP Notifications avec une boîte SQLite en mémoire, prépare l’état demandé, puis vérifie le même fichier. La CI exécute d’abord le producteur du contrat, puis son vérificateur. Aucun Pact Broker n’est nécessaire pour le flux local.

## Alternatives considérées

- Garder seulement les schémas Zod partagés : utile pour valider les données, insuffisant pour détecter une route ou des en-têtes incompatibles.
- Ajouter un Pact Broker hébergé : apporte le partage de contrats entre dépôts et la matrice de compatibilité des déploiements, mais n’est pas nécessaire pour ce monorepo local.

## Conséquences

Le contrat doit être régénéré par `pnpm --filter @ticketrush/api pact:consumer` avant `pnpm --filter @ticketrush/notifications pact:provider`. Le fichier JSON reste versionné et relu comme une API. La vérification démarre le serveur HTTP réel avec une base locale éphémère; elle n’utilise ni Google, ni le cloud, ni un broker externe.
