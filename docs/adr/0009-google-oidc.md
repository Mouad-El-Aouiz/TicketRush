# ADR 0009 — Authentification Google locale avec OpenID Connect

## Contexte

Les comptes email/mot de passe utilisent déjà des sessions TicketRush, des jetons d'accès courts et un cookie de renouvellement HttpOnly. Google doit ouvrir une session TicketRush sans exposer de jeton Google au navigateur. Le projet reste exécutable localement sans compte Google configuré.

## Décision

L'API NestJS agit comme client OpenID Connect avec `openid-client`. Le flux Authorization Code utilise PKCE S256, un `state` et un `nonce` aléatoires. L'API conserve ces valeurs dans un cookie HttpOnly signé et de courte durée, puis vérifie state, nonce, signature du jeton, audience et issuer avec la bibliothèque avant d'accepter un `sub` et un email Google vérifié.

Le compte est identifié par le `sub` Google stable. L'email seul ne lie jamais un compte existant. Une adresse déjà utilisée avec mot de passe provoque un refus explicite; la liaison de comptes est un parcours distinct, authentifié et hors de cette tranche. Les comptes Google n'ont pas de mot de passe local. Les sessions sont ensuite émises et renouvelées par le mécanisme TicketRush existant.

Les identifiants `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont optionnels, locaux et exclus de Git. Sans eux, l'interface masque le bouton Google et l'API expose `enabled: false`. Le redirect URI est configuré explicitement quand nécessaire et doit correspondre exactement à celui du client Google.

## Conséquences

- Les migrations autorisent `passwordHash` nul et ajoutent un identifiant Google unique.
- Les tests vérifient la signature et l'expiration de l'état sans contacter Google. Le vrai échange nécessite des identifiants Google appartenant à l'utilisateur.
- Le mode local HTTP est réservé à l'environnement de développement; un déploiement réel devra utiliser HTTPS et un redirect URI propre à son domaine.
- Aucune connexion Google n'est activée ni aucun secret créé par cette livraison.

Références : [OpenID Connect Google](https://developers.google.com/identity/openid-connect/openid-connect), [openid-client](https://github.com/panva/openid-client).
