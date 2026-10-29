# ADR 0004 — Règles métier pour la réalisation autonome locale

## Contexte

L'utilisateur autorise la réalisation complète avec publication et fusion des branches, sans validation intermédiaire. L'hébergement reste local. Les décisions ci-dessous résolvent les points ouverts des stories ; elles ne prétendent pas valider sa maîtrise pédagogique.

## Décision

- L'inscription crée exclusivement un CLIENT. Un administrateur attribue ORGANISATEUR ou CONTROLEUR, avec journal d'audit et révocation des sessions. Les administrateurs sont provisionnés par l'outillage local, pas par l'inscription publique.
- L'organisateur affecte des contrôleurs existants à ses événements. Un contrôleur ne scanne que les événements affectés.
- Un brouillon est modifiable ; après publication, le prix, la capacité et les informations restent immuables dans le MVP. La publication exige une catégorie et une date future.
- Le retrait administratif bloque les nouvelles réservations ; les holds actifs, commandes et billets restent valables selon leur expiration initiale. Il ne constitue pas une annulation du spectacle. Une annulation commerciale complète reste hors MVP.
- Le paiement fait foi à l'instant où le serveur effectue la transition transactionnelle, avant expiration, jamais à une date fournie par le client. Un succès tardif est enregistré comme remboursé par le simulateur ; aucun billet n'est émis.
- Les emails restent dans une boîte locale de démonstration ; les paiements sont simulés. Aucun paiement réel ni compte cloud n'est provisionné.

## Alternatives et conséquences

Autoriser des modifications de prix ou des annulations après vente demanderait des règles commerciales et un suivi supplémentaires. L'immuabilité limite ce risque. Les domaines restent dans le monolithe ; leurs opérations transversales partagent explicitement les transactions PostgreSQL. Les rôles et l'appartenance sont vérifiés côté serveur.

## Preuves de Phase 1

Deux migrations Prisma versionnées couvrent les relations, index et contraintes CHECK. L'application utilise un rôle PostgreSQL sans privilèges DDL. Tests réels de la base locale : 13 tests unitaires et 5 tests HTTP couvrant accès, catalogue et sessions. Les secrets restent dans `.env`, exclus du dépôt.
