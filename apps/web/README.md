# Interface TicketRush

Next.js 16, React 19 et client TypeScript issu du contrat OpenAPI. L'interface utilise un proxy `/api` vers NestJS ; les jetons d'accès restent en mémoire et le refresh token dans un cookie HttpOnly. Aucun secret serveur n'est inclus dans le bundle client.

Depuis la racine, démarrer l'API et le fournisseur simulé, puis `pnpm --filter @ticketrush/web build` et `pnpm --filter @ticketrush/web start`. L'interface est sur http://127.0.0.1:3001. Pour développer : `pnpm --filter @ticketrush/web dev`.

Les comptes locaux sont `client@ticketrush.local`, `organisateur@ticketrush.local`, `controleur@ticketrush.local` et `admin@ticketrush.local`. Leur mot de passe aléatoire est la valeur DEMO_PASSWORD dans le .env local, jamais dans le dépôt. Préparer ces comptes avec `pnpm --filter @ticketrush/api db:seed`.

Vérification navigateur effectuée : inscription client, sélection du concert, réservation, compte à rebours, paiement simulé confirmé et bouton PDF disponible après traitement asynchrone. Le scan manuel/lecteur USB et les espaces organisateur/administrateur utilisent les mêmes autorisations serveur testées par l'API.

Les fenêtres modales gèrent Échap, le focus et Tab. Les mises à jour affichent leurs erreurs et états de chargement. Les billets sont téléchargés par une requête authentifiée ; leurs URLs ne sont pas publiques.
