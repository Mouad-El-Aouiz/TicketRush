# TicketRush — User stories du MVP

Statut : les 13 user stories sont validées. Les règles explicitement signalées comme ouvertes ou proposées restent à préciser avant l'implémentation concernée.

## Périmètre validé

- Places non numérotées, réparties en catégories ayant chacune un prix et une capacité.
- Catalogue public ; connexion obligatoire pour réserver.
- Réservation temporaire de 10 minutes, sans survente.
- Paiement confirmé avant expiration pour valider la commande. Une confirmation tardive ne délivre aucun billet et entraîne une annulation ou un remboursement simulé.
- Une commande ou un événement de paiement rejoué ne produit aucun doublon.
- Un billet par place achetée, accepté une seule fois au contrôle.
- Accès contrôlé par rôle et par appartenance de la ressource.
- Montants en centimes et dates enregistrées en UTC.

## Limites proposées

- Paiement simulé pour le MVP.
- Annulations volontaires et remboursements demandés par les clients reportés après le MVP. Le traitement des paiements tardifs reste inclus.
- Attribution des rôles privilégiés, affectation des contrôleurs aux événements et règles de modération à préciser avant leur implémentation.

## US-01 — Créer un compte client

En tant que visiteur, je veux créer un compte pour pouvoir réserver des places.

Critères d'acceptation :
- Une adresse email valide et un mot de passe conforme à la politique définie permettent de créer un compte CLIENT.
- Une adresse email déjà enregistrée ne permet pas de créer un second compte.
- Une inscription publique ne permet pas de choisir un rôle privilégié.
- Aucun mot de passe en clair ni hachage n'est renvoyé dans les réponses.

Phase : 1. Compétences : authentification, validation des entrées, contraintes SQL.

## US-02 — Gérer sa session

En tant que client, je veux me connecter, renouveler ma session et me déconnecter pour accéder à mon compte.

Critères d'acceptation :
- Des identifiants valides permettent d'accéder aux routes autorisées.
- Des identifiants invalides sont refusés sans révéler lequel est incorrect.
- Le renouvellement effectue une rotation du refresh token ; l'ancien ne peut plus être utilisé.
- La déconnexion révoque le refresh token de la session concernée.
- Un jeton expiré ou invalide ne permet pas d'accéder à une route protégée.

Phase : 1. Compétences : JWT, refresh tokens, rotation, révocation, sécurité des API.

## US-03 — Consulter le catalogue public

En tant que visiteur, je veux parcourir les événements publiés pour choisir une sortie.

Critères d'acceptation :
- La liste et le détail des événements publiés sont accessibles sans connexion.
- Un événement en brouillon n'est pas accessible au public, même par son identifiant.
- Le détail expose le lieu, la date et les catégories avec leurs prix.
- La liste est paginée ; les filtres et tris disponibles sont documentés.
- Les paramètres invalides produisent une erreur conforme au contrat commun.

Phase : 1. Compétences : REST, pagination, filtrage, tri, documentation OpenAPI.

## US-04 — Préparer et publier un événement

En tant qu'organisateur, je veux créer et publier mon événement pour ouvrir sa vente.

Critères d'acceptation :
- Un organisateur peut créer un brouillon et modifier ses informations avant publication.
- Il peut définir des catégories avec un nom, un prix en centimes et une capacité.
- Un prix négatif ou une capacité non entière ou non positive est refusé.
- La publication exige les informations obligatoires et au moins une catégorie valide.
- Un organisateur ne peut pas modifier ni publier l'événement d'un autre.

À préciser : modifications autorisées après publication et transition exacte d'ouverture des ventes.

Phase : 1. Compétences : modèle relationnel, DTO, RBAC, autorisation au niveau des objets.

## US-05 — Réserver temporairement des places

En tant que client connecté, je veux réserver une quantité dans une catégorie pour disposer du temps nécessaire au paiement.

Critères d'acceptation :
- Une quantité entière strictement positive peut être réservée si la vente est ouverte et le stock suffisant.
- La réponse indique l'identifiant de réservation et son expiration, 10 minutes après sa création.
- Les places réservées deviennent indisponibles pour les autres réservations.
- Une demande sans authentification, sur un brouillon ou dépassant le stock disponible est refusée.
- Des demandes simultanées ne conduisent jamais à dépasser la capacité avec le total des places réservées actives et vendues.

Phase : 2. Compétences : transactions, isolation, verrous, contraintes, tests de concurrence.

## US-06 — Libérer une réservation expirée

En tant que client, je veux que les réservations expirées libèrent leurs places pour pouvoir les acheter.

Critères d'acceptation :
- Une réservation non payée arrivée à expiration ne peut plus être convertie en vente.
- Ses places redeviennent réservables selon un délai de traitement documenté.
- Répéter le traitement d'expiration ne libère pas plusieurs fois les mêmes places.
- Une réservation déjà convertie en vente n'est pas libérée par le traitement d'expiration.

Phases : 2–3. Compétences : TTL, jobs planifiés, idempotence, cohérence des données.

## US-07 — Créer une commande sans doublon

En tant que client, je veux créer une commande depuis ma réservation pour préparer son paiement sans risque de double commande.

Critères d'acceptation :
- Seul le propriétaire d'une réservation active peut créer la commande correspondante.
- Le serveur calcule les montants en centimes à partir des données de référence.
- Une même réservation ne donne pas lieu à plusieurs commandes, même avec des clés d'idempotence différentes.
- Répéter une demande identique avec la même clé d'idempotence retourne la même commande.
- Réutiliser cette clé avec une demande différente produit une erreur explicite.
- Une répétition ne provoque aucun effet supplémentaire sur le stock.

Phase : 2. Compétences : idempotence, contraintes uniques, transactions, autorisation.

## US-08 — Payer une commande

En tant que client, je veux payer ma commande auprès du fournisseur simulé pour confirmer mes places.

Critères d'acceptation :
- Seul le propriétaire peut initier le paiement de sa commande éligible.
- Le fournisseur simulé permet de reproduire un succès et un échec.
- Une redirection ou une déclaration du client ne suffit pas à marquer la commande comme payée.
- Une confirmation valide traitée avant expiration convertit la réservation en vente une seule fois.
- À expiration ou après, une confirmation ne génère aucun billet et déclenche une annulation ou un remboursement simulé traçable.
- Un webhook de refus libère les places et clôt la commande dans la même transaction ; une répétition ne libère pas le stock deux fois.
- Une réussite reçue après le refus est remboursée en simulation et ne délivre aucun billet.

Proposition à confirmer : l'heure de référence est celle du serveur lors de la transition transactionnelle vers l'état payé, et non l'heure annoncée par le fournisseur.

Phase : 3. Compétences : intégration HTTP, états métier, transactions, cas limites temporels.

## US-09 — Traiter les confirmations de paiement de façon fiable

En tant qu'exploitant, je veux traiter les notifications du fournisseur sans doublons pour préserver la cohérence des commandes.

Critères d'acceptation :
- Une signature HMAC invalide entraîne le refus du webhook sans modification métier.
- Le paiement reçu doit correspondre à la commande et au montant attendus.
- Rejouer cinq fois le même événement ne produit qu'une transition métier et un billet par place.
- Des événements en désordre ne font pas régresser une commande payée vers un état antérieur.
- La validation de commande et l'enregistrement de son événement outbox sont atomiques.

Phase : 3. Compétences : webhooks, HMAC, idempotence, outbox, cohérence éventuelle.

## US-10 — Recevoir ses billets

En tant que client ayant payé, je veux recevoir un billet PDF avec QR code par place achetée pour entrer à l'événement.

Critères d'acceptation :
- Une commande payée déclenche la génération asynchrone d'un billet par place.
- Chaque billet possède un code unique et un PDF avec QR code.
- Le client reçoit une notification lorsque ses billets sont disponibles.
- Les reprises du traitement ne créent pas de billets supplémentaires.
- Un échec de génération ou de notification est retenté avec backoff ; après épuisement des tentatives, le job est conservé dans une file d'échec consultable.
- Un problème d'envoi de notification n'annule pas une commande payée.

Phase : 3. Compétences : BullMQ, retries, dead-letter queue, génération PDF, idempotence.

## US-11 — Consulter ses commandes et billets

En tant que client, je veux consulter mes commandes et télécharger mes billets pour retrouver mes achats.

Critères d'acceptation :
- Le client peut consulter ses commandes et leur état.
- Il peut télécharger les billets générés pour ses commandes payées.
- Il ne peut consulter ni télécharger les ressources d'un autre client, même en connaissant leur identifiant ou leur URL.
- Les listes sont paginées et les ressources absentes sont traitées selon le contrat d'erreur commun.

Phases : 1–3, livraison complète en 3. Compétences : autorisation au niveau des objets, REST, protection des fichiers.

## US-12 — Contrôler un billet à l'entrée

En tant que contrôleur autorisé, je veux scanner un billet pour accepter ou refuser une entrée.

Critères d'acceptation :
- Un billet valide pour l'événement contrôlé est accepté et sa date de scan est enregistrée.
- Un billet inconnu, déjà utilisé ou appartenant à un autre événement est refusé avec un motif exploitable.
- Deux scans simultanés d'un même billet produisent exactement une acceptation.
- Un client ou un organisateur sans permission de contrôle ne peut pas utiliser cette fonction.
- Un contrôleur ne peut scanner que pour les événements auxquels il est affecté.

À préciser avant conception : gestion des affectations des contrôleurs.

Phase : 3. Compétences : autorisation, mise à jour atomique, tests de concurrence.

## US-13 — Modérer un événement

En tant qu'administrateur, je veux retirer un événement problématique de la vente pour empêcher de nouvelles réservations.

Critères d'acceptation proposés :
- Seul un administrateur peut effectuer cette opération de modération.
- Un événement retiré n'accepte plus de nouvelles réservations.
- Les commandes et billets existants sont conservés et ne sont pas supprimés par cette opération.
- L'opération conserve l'auteur, la date et le motif de la décision.

À préciser avant implémentation : effet du retrait sur les réservations actives, paiements en cours et billets déjà vendus. Le retrait ne constitue pas une annulation de l'événement.

Phase : 1 pour les accès et le statut ; cohérence à compléter en 2–3. Compétences : exigences métier, RBAC, traçabilité, gestion des états.

## Validation et découpage

Ces stories représentent des résultats métier ; elles seront découpées en tâches techniques courtes avant implémentation. Les scénarios de panne, concurrence et rejeu fourniront les preuves de validation adaptées. Une story comportant une règle encore ouverte ne passe pas en implémentation avant résolution de cette règle.

Compétences de la présente tâche : produit (user stories et critères d'acceptation), Agile (découpage), documentation et communication des compromis.
