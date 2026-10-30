# Bilan — Phase 5 : architecture distribuée et résilience

## Ce qui a été construit

- Extraction du service Notifications avec RabbitMQ, boîte de réception SQLite, message `TICKETS_READY` versionné, idempotence, reprises et dead-letter queue.
- Compensation des paiements refusés et appels au fournisseur simulé protégés par timeout, retries avec jitter, circuit breaker et bulkhead.
- Webhooks sortants `order.paid` avec signature HMAC, secrets chiffrés, gestion d’endpoint par organisateur et protection SSRF.
- Contrat HTTP entre l’API et Notifications généré puis vérifié par Pact V4, sans Pact Broker.

## Preuves à conserver

- `apps/notifications/src/broker.integration.ts` : déduplication, redémarrage, retry et dead-letter avec RabbitMQ.
- `apps/api/src/common/resilient-http.spec.ts` : erreurs 500, ouverture/récupération du circuit et limite de concurrence.
- `apps/api/test/commerce.e2e-spec.ts` : webhook de paiement, rejeux, compensation et autorisation propriétaire.
- `apps/api/src/webhooks/` et `apps/api/test/commerce.e2e-spec.ts` : blocage des destinations SSRF et scénarios de gestion d’endpoint.
- `pnpm --filter @ticketrush/api pact:consumer`, puis `pnpm --filter @ticketrush/notifications pact:provider` : contrat versionné dans `pacts/`.
- Le 30 octobre 2026, les tests locaux ont passé : 36 unitaires API, 4 unitaires Notifications, 21 e2e API, 4 intégration RabbitMQ et les deux tests Pact. Le smoke Docker a vérifié la livraison d’une notification. La CI valide aussi migrations, types, lint, tests et builds.

## Compétences du référentiel

| Compétence | Niveau de pratique | Preuve dans le dépôt |
|---|---|---|
| Messagerie et consommateurs idempotents | Pratiqué | `apps/notifications/src/consumer.ts`, `apps/notifications/src/broker.integration.ts` |
| Architecture distribuée et frontières de service | Pratiqué | `docs/adr/0005-notifications-service.md` |
| Résilience : timeout, retry avec jitter, circuit breaker, bulkhead | Pratiqué | `apps/api/src/common/resilient-http.ts`, `apps/api/src/common/resilient-http.spec.ts` |
| Compensation et cohérence éventuelle | Pratiqué | `docs/adr/0006-payment-failure-compensation.md`, `apps/api/test/commerce.e2e-spec.ts` |
| Contrats interservices et rétrocompatibilité | Pratiqué | `pacts/TicketRush API-TicketRush Notifications.json`, `docs/adr/0008-pact-notifications-contract.md` |
| Sécurité SSRF, DNS, TLS et secrets | Pratiqué | `apps/api/src/webhooks/`, `docs/adr/0007-secure-outgoing-webhooks.md` |
| DDD et CQRS | Vu, non appliqué | Monolithe modulaire et interfaces explicites suffisent à ce stade ; aucun besoin mesuré de CQRS. |

Les résultats montrent que les scénarios documentés fonctionnent; ils ne suffisent pas à conclure à une maîtrise autonome.

## Compétences à consolider

- **Pannes réseau de bout en bout** : ajouter une latence puis une indisponibilité du fournisseur, mesurer la réponse de l’API et vérifier que le hold se libère à son expiration sans paiement confirmé.
- **Évolution de contrat** : ajouter un champ optionnel au message et au contrat HTTP, puis démontrer la compatibilité des deux versions avant un changement cassant.
- **Exploitation distribuée** : arrêter RabbitMQ pendant une livraison et diagnostiquer la reprise uniquement à l’aide des logs, métriques et traces locaux.

## README et jalon Git

Le README décrit le service Notifications, les webhooks sortants, le flux Pact et les validations locales. Tag proposé pour le dépôt après fusion : `v0.5-resilience`.
