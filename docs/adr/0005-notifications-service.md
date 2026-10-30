# ADR 0005 — Extraire les notifications locales

## Contexte

Un billet PDF doit rester accessible même si sa notification est retardée. Le projet demande un seul service extrait pour pratiquer messagerie, livraison répétée et frontières de données. L’exécution reste locale.

## Décision

Extraire `apps/notifications`, consommateur RabbitMQ du contrat versionné `TICKETS_READY` partagé dans `packages/contracts`. Le monolithe écrit une outbox après disponibilité de tous les PDF. Son identifiant déterministe reste identique lors d’un retry. Le relayeur attend la confirmation du broker avant de marquer la publication ; une perte de réponse peut donc produire une nouvelle livraison.

Le service accuse réception après une transaction dans sa propre boîte SQLite : reçu de message et notification sont atomiques. L’identifiant du message et la commande sont uniques. Un identifiant réutilisé avec un contenu modifié est refusé ; les contrats invalides vont en dead-letter et les erreurs transitoires utilisent une queue de retry à délai de cinq secondes, au plus cinq tentatives.

L’API consulte la boîte par HTTP interne avec une clé de service ; l’utilisateur ne choisit jamais l’identifiant interrogé. Le service ne lit aucune table métier PostgreSQL et l’API ne lit pas son fichier. Les anciennes notifications du monolithe restent consultables, dédupliquées par commande. Sans configuration distribuée, le mode monolithe historique demeure disponible ; une configuration partielle est refusée.

SQLite limite l’exploitation locale à un fichier et un seul consommateur actif, avec WAL et transactions synchrones très courtes. Le module intégré à Node 26 est encore qualifié de release candidate dans sa documentation ; ce compromis est limité à cet environnement local. Ce choix ne vaut pas architecture multi-hôtes : une base dédiée adaptée sera requise pour répliquer ce service.

La notification est une boîte dans l’application ; aucun email réel n’est envoyé à un tiers. Le paiement demeure fictif. La compensation du stock conserve la règle validée : expiration du hold, même lorsque le fournisseur est indisponible, et remboursement simulé d’une confirmation tardive.

## Alternatives

Conserver uniquement BullMQ était plus simple, mais n’exerçait pas une frontière de service. Une base PostgreSQL dédiée au service serait adaptée à une exploitation plus large, avec davantage de configuration locale. Kafka et une extraction supplémentaire n’apportent pas de bénéfice à ce volume.

## Conséquences et limites

La disponibilité du broker et celle du consommateur sont observées séparément du cœur de la billetterie. Les messages sont persistants, les queues durables et les effets idempotents. Un broker local unique n’offre aucune haute disponibilité ; les sauvegardes de son volume et du fichier de boîte restent nécessaires. Une confirmation de publication n’est pas une confirmation de traitement par le consommateur.

Les tests couvrent contrat, déduplication, persistance du fichier, arrêt/reprise du consommateur, retry retardé et dead-letter sur de vraies queues isolées. Le schéma Zod partagé valide le message RabbitMQ ; le contrat HTTP de lecture de la boîte de réception est vérifié par Pact (ADR 0008).

Références : [confirmations et acknowledgements RabbitMQ](https://www.rabbitmq.com/docs/confirms), [API amqplib](https://amqp-node.github.io/amqplib/channel_api.html), [SQLite intégré à Node](https://nodejs.org/api/sqlite.html).
