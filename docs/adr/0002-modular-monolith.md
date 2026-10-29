# ADR 0002 — Commencer par un monolithe modulaire

- Date : 2026-10-29
- Statut : accepté ; document validé dans la conversation.
- Tâche : P0-05.
- Décision liée : [ADR 0001 — NestJS](0001-backend-framework.md).

## Contexte

TicketRush doit garantir qu'un stock limité de places n'est jamais survendu, puis traiter des paiements et délivrer des billets sans doublons. Le projet est développé seul, progressivement, avec un objectif d'apprentissage et des pratiques de revue, tests et livraison.

Découper immédiatement ces responsabilités en microservices ajouterait des échanges réseau, des pannes partielles et des difficultés de coordination des données avant que les invariants métier soient maîtrisés. Nous voulons apprendre d'abord à définir des frontières logiques, puis expérimenter une extraction justifiée en Phase 5.

Le choix de NestJS n'impose pas ce modèle de déploiement. Cette décision complète le choix du framework.

## Décision

Construire l'API `apps/api` comme un monolithe modulaire : une application dont les modules métier sont livrés et déployés ensemble. Utiliser une base PostgreSQL commune au départ, avec une propriété explicite des données par module.

Cette décision concerne les domaines métier de l'API. PostgreSQL, Redis et les workers sont des composants d'exécution distincts ; leur présence ne transforme pas automatiquement l'application en microservices. Le faux fournisseur de paiement restera un composant séparé pour simuler une intégration externe. L'organisation exacte des processus de workers sera définie au moment de leur introduction.

### Frontières initiales

| Module | Responsabilités et données possédées |
|---|---|
| `users` | Comptes, profils et rôles ; données des utilisateurs. |
| `auth` | Authentification, sessions et refresh tokens ; accès aux comptes par l'interface publique de `users`. |
| `events` | Catalogue, événements, catégories, capacités et compteurs de stock associés. |
| `reservations` | Holds, quantités, états et expiration ; sollicite `events` pour les opérations sur le stock. |
| `orders` | Commandes, lignes, montants figés et clés d'idempotence. |
| `payments` | Tentatives de paiement, références fournisseur, vérification et déduplication des webhooks entrants. |
| `tickets` | Billets, codes uniques, références PDF et scans. |
| `notifications` | Préparation et livraison des notifications ; consomme les informations nécessaires fournies par les autres modules. |
| `assistant` | Extension de Phase 7 ; accès aux données par des interfaces publiques autorisées. |

Les noms de modules sont des frontières initiales à affiner avant implémentation, pas des dossiers fonctionnels déjà créés. Le placement détaillé des données techniques partagées, notamment l'outbox, sera précisé dans la conception correspondante.

### Règles de communication

- Un module exporte une interface publique limitée : services applicatifs ou contrats explicitement exposés par son module NestJS.
- Un module ne lit ni ne modifie directement les tables d'un autre, y compris via son propre client ORM ou du SQL brut.
- Les repositories restent internes à leur module ; ils ne deviennent pas une API publique contournant les règles métier.
- Une clé étrangère entre domaines est autorisée et protège l'intégrité ; elle ne donne pas le droit d'accéder aux données d'un autre module.
- Les appels synchrones conviennent lorsqu'une réponse immédiate est nécessaire. Les événements conviennent aux effets différés ; ils ne remplacent pas une garantie transactionnelle requise.
- Éviter les dépendances circulaires. Un besoin de cycle doit conduire à revoir les responsabilités ou à définir une orchestration explicite, plutôt qu'à masquer le cycle.
- Les contrats exposent des données utiles aux appelants et évitent de leur transmettre les modèles internes de l'ORM.

### Transactions et opérations transversales

Les frontières modulaires ne doivent pas casser la cohérence métier. Lorsqu'une opération touche plusieurs modules et exige l'atomicité, une orchestration applicative explicite coordonne leurs interfaces publiques dans une même transaction PostgreSQL.

Par exemple, créer un hold et réserver son stock doivent réussir ou échouer ensemble. Le module `reservations` ne modifie pas lui-même les compteurs de `events` : il appelle une opération publique de stock participant à la même transaction. De même, confirmer un paiement et enregistrer l'événement outbox correspondant doivent respecter la transaction prévue en Phase 3.

Le mécanisme de propagation du contexte transactionnel sera conçu en Phase 2. Il devra permettre à chaque module de conserver ses accès aux données sans laisser un orchestrateur écrire directement dans toutes les tables. Il ne faut pas introduire dès maintenant un framework générique de transactions.

Les traitements différés tels que la génération PDF et les notifications pourront suivre la validation métier, avec outbox et consommateurs idempotents quand ces mécanismes seront introduits. Un simple événement en mémoire ne garantit pas la livraison après un arrêt du processus.

## Alternatives considérées

### Monolithe modulaire — option retenue

Avantages : transactions locales possibles, appels internes directs, moins de composants métier à déployer et diagnostic initial plus simple. Les frontières explicites permettent de pratiquer le couplage et la cohésion avant une extraction.

Inconvénients : livraison commune des modules, risque de couplage involontaire dans une base partagée et absence d'isolation des pannes entre domaines dans un même processus. Les règles de dépendance nécessitent des revues et des vérifications ; NestJS ne les garantit pas à lui seul.

### Microservices dès le départ

Avantages : possibilité de déployer et dimensionner indépendamment les services, frontières d'exécution explicites.

Inconvénients pour le démarrage : communications réseau, contrats interservices, pannes partielles, observabilité distribuée et cohérence entre données à gérer dès le premier parcours. L'indépendance réelle demanderait aussi de décider de la propriété et de l'isolation des bases de données.

Cette complexité sera étudiée progressivement en Phase 5 plutôt qu'introduite avant de connaître les contraintes du système.

## Conséquences

- Organiser chaque domaine autour de ses controllers, services et repositories ; garder ses détails internes privés.
- Tester les règles métier, puis les interactions réelles entre modules et base de données, notamment l'atomicité et la concurrence.
- Examiner les imports et les accès ORM lors des revues pour repérer les franchissements de frontières.
- Accepter que les modules soient déployés ensemble et que la base commune impose une discipline de propriété.
- Ne pas revendiquer de performance ou de facilité d'extraction sans mesure ni preuve.
- En Phase 5, extraire un seul service après avoir documenté son besoin, ses contrats, sa propriété des données et les nouveaux modes de panne dans un nouvel ADR. L'extraction restera un travail explicite, pas une conséquence automatique du découpage en modules.

## Vérification de cette décision

La revue documentaire vérifie les frontières, les alternatives, les conséquences et la compatibilité des règles de communication avec les transactions nécessaires.

La validation pratique viendra avec les modules et leurs tests en Phases 1 à 3. Cet ADR n'atteste d'aucun code ni test déjà exécuté.

Compétences travaillées : architecture modulaire, couplage et cohésion, monolithe ou microservices, frontières entre services, transactions, documentation et communication des compromis.
