# Opérations et résilience locales

## Mesures du catalogue

Mesure HTTP locale du 30 octobre 2026, même version de l'API, après échauffement : 100 requêtes, concurrence 10, endpoint `/api/events?limit=9`. Les résultats bruts sont versionnés dans `load-baseline.json` et `load-cached.json`.

| Configuration | Latence p95 | Débit observé | Erreurs |
|---|---|---|---|
| Cache désactivé | 120,43 ms | 156,52 requêtes/s | 0 |
| Cache activé | 73,06 ms | 269,21 requêtes/s | 0 |

Le cache utilise un TTL de 30 secondes et une version de catalogue invalidée après publication ou retrait. Les réservations ne font jamais confiance au cache pour le stock. Les chiffres décrivent ce petit scénario local, avec d'autres travaux sur la machine, pas une capacité de production. Le script k6 séparé permet des campagnes plus longues.

## Disponibilité et protection

`/api/ops/live` vérifie le processus ; `/api/ops/ready` teste PostgreSQL et Redis. `/api/ops/metrics` expose les requêtes, erreurs, distributions de latence et mesures du processus. Les labels utilisent les routes normalisées, sans identifiants utilisateur. Les logs pino enregistrent méthode, chemin sans query string, statut, correlationId et traceId disponible ; aucun body, cookie ou Authorization n'est journalisé.

Les routes d'authentification sont limitées par adresse de connexion et les réservations par utilisateur. La protection s'appuie sur un compteur Redis atomique. La file virtuelle utilise un sorted set par événement, avec expiration des membres inactifs. Son endpoint est une primitive d'admission locale ; elle ne garantit pas à elle seule une politique commerciale de rush.

La disponibilité publique est diffusée par SSE ; la fermeture de la modale ferme le flux. Deux instances stateless de l'API sont prévues derrière Nginx, avec sessions, cache, jobs et fichiers partagés par leurs services respectifs.

## Résilience du fournisseur

Chaque appel au fournisseur simulé possède un timeout et au plus trois tentatives avec backoff et jitter. Un circuit s'ouvre après trois opérations échouées et tente une reprise après 30 secondes. Un bulkhead limite les appels simultanés à huit. Les tests simulent des erreurs 500, une indisponibilité répétée et une saturation ; ils vérifient les retries, l'ouverture et la reprise du circuit et le refus d'un appel concurrent.

En cas de résultat incertain, vérifier la commande avant de retenter : une réponse réseau perdue ne prouve pas que le paiement a échoué. Les webhooks restent idempotents et les places non payées sont compensées par expiration.

## Observabilité optionnelle

`compose.observability.yaml` ajoute Prometheus, Grafana et Jaeger. Le SDK OpenTelemetry n'exporte que si OTEL_EXPORTER_OTLP_ENDPOINT est défini. La configuration Docker oriente les traces vers Jaeger local ; aucun export cloud n'est activé. Une configuration présente ne remplace pas sa vérification d'exécution, qui doit être indiquée séparément.

Compétences : mesure avant optimisation, cache-aside, TTL et invalidation, SSE, rate limiting, circuit breaker, retries, bulkheads, métriques, logs et tracing.
