# Interface locale — vérification

Next.js 16.4.3 et React 19.3.1 affichent le catalogue réel de l'API NestJS. Les types de données sont générés depuis le contrat OpenAPI versionné dans packages/api-client ; la couche fetch gère l'authentification en mémoire, la rotation de session et les erreurs.

Parcours navigateur vérifié le 30 octobre 2026 : inscription d'un compte client de test, sélection du concert de démonstration, réservation d'une place, compte à rebours 9:59, paiement simulé réussi via le fournisseur séparé, commande payée puis bouton PDF disponible après le worker. Les écrans organisateur, contrôleur et administrateur s'appuient sur les routes autorisées côté serveur.

Contrôles effectués : build Next.js, TypeScript frontend et backend, lint API, lint React avec vérification des dépendances de hooks, compilation API et contrat OpenAPI généré. Les modales sont utilisables avec Échap et Tab ; le focus est restauré à leur fermeture. Les requêtes catalogue sont annulées lors d'un changement de recherche et les commandes sont rafraîchies avec nettoyage des timers.

Les identifiants de démonstration sont décrits dans apps/web/README.md ; le mot de passe reste uniquement dans .env. Aucun paiement réel, envoi d'email externe ni publication Internet n'est activé.

Compétences : contrats frontend/backend, React, formulaires, latence, gestion des erreurs et revue du code généré. La validation manuelle n'est pas une certification exhaustive d'accessibilité ou un test de charge.
