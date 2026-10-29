# ADR 0001 — Choisir NestJS pour l'API backend

- Date : 2026-10-29
- Statut : accepté ; document validé dans la conversation.
- Tâche : P0-04.

## Contexte

TicketRush est une plateforme de billetterie construite progressivement pour pratiquer les compétences backend Node.js et TypeScript de niveau intermédiaire. Le MVP couvre les comptes, le catalogue, les réservations concurrentes, les commandes, le paiement simulé et les billets.

Le projet doit rester compréhensible pour un développeur travaillant seul, tout en permettant de pratiquer des conventions d'équipe : responsabilités explicites, tests, documentation et revues de code.

Nous cherchons un framework qui facilite une structure cohérente entre les domaines métier et permette d'apprendre l'injection de dépendances, la validation, l'autorisation et la gestion centralisée des erreurs. Le choix ne repose pas sur un benchmark de performance ; aucun gain de débit ou de latence n'est revendiqué.

## Décision

Utiliser NestJS pour l'API `apps/api`, avec TypeScript en mode strict.

Chaque domaine métier sera organisé en module. À l'intérieur des modules :

- Les controllers traduisent les requêtes HTTP et délèguent les actions aux services.
- Les services portent les règles métier et la coordination des opérations.
- Les repositories encapsulent les accès aux données lorsque ces accès sont nécessaires.
- L'injection de dépendances relie ces composants et permet de substituer leurs dépendances dans les tests.

Les mécanismes du framework seront introduits au moment où ils répondent à un besoin concret : pipes pour la validation des entrées, guards pour le contrôle des accès, exception filters pour le contrat d'erreur commun, interceptors pour les traitements transversaux adaptés.

Les permissions dépendant d'une ressource doivent aussi être vérifiées là où ses données et ses règles métier sont disponibles. La présence d'un guard de rôle ne suffit pas à prouver qu'un utilisateur possède la ressource demandée.

La version de NestJS, la version LTS de Node.js et l'adaptateur HTTP seront vérifiés et fixés lors de l'initialisation technique. Cet ADR ne choisit pas les versions des dépendances.

## Alternatives considérées

### NestJS — option retenue

Avantages : conventions explicites pour les modules et composants, injection de dépendances intégrée, mécanismes structurés pour les préoccupations HTTP transversales. Ces concepts correspondent directement aux compétences que le projet doit faire pratiquer.

Inconvénients : apprentissage initial des conventions et des décorateurs, davantage de structure à comprendre avant de livrer un premier endpoint, risque d'ajouter des abstractions sans besoin métier.

### Express — alternative plus simple au démarrage

Avantages : une API HTTP peut démarrer avec peu de concepts et peu de fichiers ; l'organisation reste libre.

Inconvénients pour ce projet : il faudrait définir et maintenir nous-mêmes les conventions de modules, la composition des dépendances et l'organisation des traitements transversaux. Express permet une architecture propre, mais ne fournit pas à lui seul les conventions pédagogiques recherchées ici.

Express reste une alternative viable. Le choix de NestJS repose sur l'alignement avec le parcours d'apprentissage et la cohérence attendue du code, pas sur une incapacité d'Express à couvrir le métier.

## Conséquences

- Prévoir des exercices courts sur modules, providers et injection de dépendances avant d'empiler les fonctionnalités.
- Garder les règles métier dans les services plutôt que dans les controllers ou les décorateurs.
- Éviter les couches et interfaces créées uniquement pour reproduire un schéma : chaque abstraction doit répondre à un besoin expliqué.
- Tester les règles métier indépendamment du transport HTTP quand cela est pertinent, puis vérifier le comportement des routes par des tests d'intégration.
- Accepter un couplage au framework dans la composition de l'application et ses mécanismes HTTP. Ne pas présenter une migration future comme gratuite.
- Traiter séparément la décision de déployer un monolithe modulaire dans l'ADR 0002 ; NestJS ne détermine pas à lui seul les frontières de déploiement.
- Réexaminer ce choix si une contrainte démontrée apparaît. Toute modification structurante fera l'objet d'un nouvel ADR lié à celui-ci.

## Vérification de cette décision

La revue documentaire doit confirmer que le contexte, le choix, les deux options et leurs conséquences sont explicites et cohérents avec le périmètre validé.

L'application pratique sera vérifiée en Phase 1 : premier module métier, responsabilités controller/service/repository, dépendances explicites, validation des entrées et tests adaptés. Aucun résultat d'exécution n'est revendiqué à ce stade.

Compétences travaillées : frameworks backend, fonctionnement de NestJS, injection de dépendances, architecture modulaire, documentation et communication des compromis.
