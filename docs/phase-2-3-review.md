# Réservations, paiements et billets — preuves locales

## Architecture

Chaque réservation verrouille l'événement puis sa catégorie. Les places indisponibles sont la somme des holds payés et des holds actifs non expirés, calculée dans cette transaction. Les dates d'expiration sont donc effectives même si le job de nettoyage est retardé. Le verrou d'événement favorise ici la cohérence avec le retrait administratif ; sa contention sera mesurée avant toute optimisation.

Les commandes figent le prix en centimes et utilisent un verrou transactionnel de clé d'idempotence ainsi qu'une réservation unique. Un webhook HMAC vérifié verrouille les mêmes ressources et crée l'événement outbox dans la transaction du paiement. Les jobs BullMQ ont des identifiants stables et les billets une contrainte unique par commande/index. Les notifications sont disponibles dans une boîte locale authentifiée.

## Vérifications exécutées

Sur PostgreSQL 18 local, le test `commerce.e2e-spec.ts` a constaté :

| Scénario | Résultat |
|---|---|
| Implémentation naïve isolée, 50 lectures concurrentes avant écriture, capacité 10 | 50 holds : survente de 40 places démontrée |
| Implémentation verrouillée, 500 appels concurrents au service de réservation, capacité 10 | 10 acceptés, 490 refusés, zéro survente, durée totale observée 3185 ms |
| Expiration répétée | Disponibilité restaurée sans double libération |
| 10 créations avec la même clé | Une commande ; réutilisation pour un autre hold refusée |
| Signature webhook incorrecte | Refus HTTP 401 |
| Paiement confirmé puis rejoué cinq fois | Un événement outbox et deux billets pour deux places |
| Génération relancée | Aucun billet supplémentaire ; PDF téléchargeable par son propriétaire uniquement |
| Deux scans simultanés | Une seule acceptation |
| Confirmation après expiration | Paiement simulé enregistré REFUNDED, aucun billet |
| Deux transactions inversant les verrous | Un deadlock volontaire et une transaction rejetée ; les chemins applicatifs adoptent un ordre stable |

Les 3185 ms décrivent un lot d'appels de service en local, pas une latence p95 HTTP ni une garantie de débit. Le scénario naïf est limité aux fixtures de test ; aucune route vulnérable n'est exposée.

## Compétences et consolidation

| Compétence | Niveau | Preuve |
|---|---|---|
| Transactions, verrous, deadlocks | Implémenté et testé ; maîtrise personnelle à vérifier | Modules reservations/orders et commerce.e2e-spec.ts |
| Idempotence et webhooks signés | Implémenté et testé | WebhookReceipt, clé de commande et tests de rejeu |
| Jobs, retries et outbox | Implémenté ; vérification worker séparée dans les tests | DeliveryModule et outbox_events |
| PDF, QR et contrôle d'accès | Implémenté et testé localement | TicketsModule et tests PDF/scan |

Questions d'entretien à reprendre avec l'utilisateur après la livraison autonome :

1. Pourquoi le test naïf dépasse-t-il la capacité alors que chaque requête vérifie le stock ?
2. Pourquoi la clé de commande et l'identifiant de webhook ne résolvent-ils pas exactement le même problème ?
3. Que se passe-t-il si le processus s'arrête après la création du job BullMQ, avant le marquage de l'outbox ?

La persistance locale des PDF n'est pas une sauvegarde et le fournisseur est simulé. Les scénarios de panne et de charge complets restent distincts de ces tests d'invariants.
