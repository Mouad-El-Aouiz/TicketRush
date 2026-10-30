# Diagnostiquer un incident local

## Identifier et corréler

Relever l'en-tête `x-correlation-id` ou le champ `correlationId` de l'erreur, sans copier les cookies, tokens ou mots de passe. Les logs HTTP structurés contiennent ce même identifiant. Si OpenTelemetry est actif, le `traceId` permet de retrouver la trace dans Jaeger.

## Vérifier dans cet ordre

1. `/api/ops/live` : si le processus ne répond pas, vérifier son conteneur et son démarrage.
2. `/api/ops/ready` : un statut 503 signale une dépendance indisponible. Vérifier PostgreSQL et Redis avec `docker compose ps`.
3. Grafana : débit, p95, erreurs 5xx et mémoire. Prometheus scrape séparément les deux instances API.
4. Logs : rechercher le correlationId ; les valeurs des entrées ne sont volontairement pas journalisées.
5. Traces : suivre HTTP, base et appels au fournisseur. Les traces ne sont exportées que lorsque l'endpoint OTLP local est configuré.

## Paiement indisponible

Le circuit breaker refuse temporairement les nouveaux appels après plusieurs échecs. Vérifier d'abord l'état de la commande : une réponse HTTP perdue ne signifie pas que le paiement n'a pas été confirmé par webhook. Ne pas modifier directement le stock ou les billets en base.

Un hold non payé expire après 10 minutes. Le calcul du stock ignore immédiatement les holds expirés ; le nettoyage asynchrone peut arriver ensuite. Une confirmation tardive reste remboursée en simulation et ne délivre aucun billet.

## Billet en préparation

Vérifier la commande payée, puis l'outbox et la queue. L'API administrateur `/api/admin/jobs` donne les compteurs ; `/api/admin/jobs/dead-letter` montre les échecs épuisés. Après résolution de la cause, le retry est disponible par identifiant. Les traitements sont idempotents ; ne pas créer manuellement un second billet.

## Secrets et données

Ne pas partager de sortie de `docker inspect`, de configuration Compose résolue ou de `.env`. Les journaux ne sont pas une sauvegarde. Conserver ensemble les sauvegardes PostgreSQL et les PDF privés avant toute opération de restauration. Aucune commande de suppression des volumes n'est nécessaire au redémarrage normal.

## Exercices

Arrêter temporairement le fournisseur simulé et constater l'erreur bornée, la préservation de l'API catalogue et l'expiration du hold ; relancer ensuite le fournisseur. Comparer `/ops/live` et `/ops/ready` lors d'une indisponibilité Redis. Exécuter ces exercices uniquement sur l'environnement local et consigner ce qui a réellement été observé.
