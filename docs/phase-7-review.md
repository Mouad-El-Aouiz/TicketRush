# Bilan — Phase 7 : interface, identité, flux et IA locale

## Ce qui a été construit

- Interface Next.js du catalogue, réservation, billets et espaces par rôle; modales clavier, gestion des erreurs et états d'attente.
- Connexion Google OIDC facultative avec Authorization Code, PKCE, state, nonce, vérification des jetons côté serveur et comptes fondés sur l'identifiant Google stable.
- Import CSV en flux pour les événements, avec limites d'entrée, validation par ligne, création par lots et rapport des erreurs.
- Assistant RAG local : FAQ et événements publiés, embeddings 768 dimensions, recherche pgvector/HNSW, réponse structurée, citations vérifiées et deux outils en lecture vers le catalogue public.
- Défenses en profondeur pour l'assistant : endpoint local Ollama uniquement, modèles non téléchargés au démarrage, validation des entrées et sorties, filtrage des sources, liste blanche des outils et limitation de débit.

## Preuves à conserver

- apps/web/components/ticket-app.tsx et apps/web/components/assistant-dialog.tsx : parcours du catalogue et de l'assistant.
- apps/api/src/auth/ et docs/adr/0009-google-oidc.md : flux OIDC et protections de session.
- apps/api/src/imports/ et apps/api/test/ : traitement CSV en flux et validation.
- apps/api/src/assistant/assistant.module.spec.ts : test du RAG, du refus d'un outil non autorisé, du filtrage de citation et de la défense contre les instructions contenues dans les documents.
- apps/api/prisma/migrations/202610300003_assistant_pgvector/migration.sql : extension vectorielle, vecteurs dimensionnés et index HNSW.
- packages/api-client/openapi.json et packages/api-client/src/schema.ts : contrat et types clients régénérés.
- docs/assistant-local.md : procédure de démarrage local et choix de modèles manuels.
- CI GitHub : types stricts, lint, format, tests unitaires et e2e, Pact, intégration RabbitMQ et builds.

## Compétences du référentiel

| Compétence                                                | Niveau de pratique | Preuve dans le dépôt                                                  |
| --------------------------------------------------------- | ------------------ | --------------------------------------------------------------------- |
| Frontend, parcours produit et gestion d'état              | Pratiqué           | apps/web/components/, docs/web-review.md                              |
| Contrats frontend/backend et génération de client         | Pratiqué           | packages/api-client/openapi.json, packages/api-client/src/schema.ts   |
| OAuth 2.0 / OpenID Connect, PKCE et validation des claims | Pratiqué           | apps/api/src/auth/, docs/adr/0009-google-oidc.md                      |
| Streams, backpressure et validation d'import CSV          | Pratiqué           | apps/api/src/imports/, apps/api/test/                                 |
| Embeddings, RAG et recherche vectorielle pgvector         | Pratiqué           | apps/api/src/assistant/, migration 202610300003_assistant_pgvector    |
| Appels d'outils vers une API publique de l'application    | Pratiqué           | AssistantService.runTool, outils search_events et get_event seulement |
| Sorties structurées et vérification des citations         | Pratiqué           | answerSchema, AssistantService.ask, test unitaire assistant           |
| Injection de prompt et vérification du code généré        | Pratiqué           | instructions de confiance limitée, liste blanche, tests ciblés et CI  |

Ces livrables montrent une pratique guidée. Ils ne suffisent pas à conclure à une maîtrise autonome, et les tests ne garantissent pas qu'un modèle générera toujours une réponse exacte.

## Compétences à consolider

- OIDC réel : configurer un client Google local avec une URI de redirection de développement, puis vérifier login, refus d'email non vérifié et absence de liaison automatique par email.
- RAG et qualité : créer dix questions/réponses attendues, comparer les citations et noter les réponses avant et après un changement de contenu.
- Résistance aux instructions hostiles : publier un événement de test dont la description contient des instructions malveillantes, puis vérifier que l'assistant ne les suit pas et n'invoque que les deux outils autorisés.
- Flux CSV : importer un fichier volumineux avec une ligne invalide, mesurer la mémoire de l'API et vérifier que le flux reste borné.
- Accessibilité frontend : parcourir les écrans au lecteur d'écran et contrôler les erreurs, le focus et le contraste au clavier.

## Vérification manuelle requise

La CI ne contacte ni Google ni Ollama. Pour tester la vraie connexion, il faut les identifiants OAuth appartenant à l'utilisateur. Pour tester une réponse de l'assistant, l'utilisateur doit choisir et télécharger manuellement les modèles locaux. Vérifier aussi le temps du premier index et l'usage mémoire sur la machine cible. Aucun déploiement Internet n'est inclus : le projet reste local selon la décision de l'utilisateur.

## README et jalon Git

Le README référence ce bilan, le guide d'assistant local et les décisions d'architecture. Tag de phase proposé après fusion : v0.7-ai-identity.
