# Import CSV en flux

Un organisateur envoie un fichier UTF-8 à `POST /api/imports/events`, avec `Content-Type: text/csv`. L’interface propose un modèle et transmet directement le fichier. Le client préserve le type MIME fourni ; le renouvellement de session ne modifie pas le corps du fichier.

Colonnes, dans cet ordre : `title,description,venue,startsAt,category,capacity,priceCents`. Les dates sont UTC ISO 8601, les prix des entiers en centimes. Chaque ligne valide crée un événement **DRAFT** et sa catégorie, exclusivement pour l’utilisateur authentifié. Rien n’est publié automatiquement.

Le parseur consomme un flux Node ; la boucle attend chaque transaction de 200 événements avant de continuer. Les tampons des streams bornent la lecture pendant les écritures SQL. Le corps n’est pas transformé en une grande chaîne JSON. Limites : 20 MiB, 100 000 lignes, 64 KiB par enregistrement, 120 secondes de traitement, trois imports par minute et utilisateur. Le rapport garde au maximum 1 000 erreurs de validation avec leurs lignes physiques.

Les lots sont indépendants : si un fichier est malformé ou une limite interrompe le flux, les lots déjà committés restent des brouillons. La réponse `CSV_INCOMPLETE` contient leur nombre ; le dernier lot non validé n’est pas écrit. Vérifier ses brouillons avant de renvoyer le fichier, car les imports ne sont pas dédupliqués. Les erreurs de syntaxe ne doivent donc pas être interprétées comme une annulation globale.

Les tests d’intégration vérifient le refus du rôle client et d’un type MIME incorrect, la propriété et le statut brouillon, les erreurs par ligne, un import de 401 événements traversant trois lots et un CSV malformé. Ils nettoient uniquement leurs propres catégories et événements. Le modèle CSV est copié dans le build standalone avec les autres fichiers publics.

Compétences du référentiel : Streams/Buffers, backpressure, transactions par lots, validation, autorisation au niveau des objets, contrat OpenAPI et gestion des erreurs dans le frontend. À pratiquer : expliquer pourquoi lire tout le fichier avec `readFile` puis créer les événements avec un `Promise.all` sans limite n’offre pas les mêmes bornes mémoire/connexions.

Vérification Docker du 30 octobre 2026 : `node --env-file=.env scripts/smoke-csv.mjs` envoie effectivement un corps en flux via Nginx, obtient un brouillon valide et une erreur à la ligne 3, vérifie le téléchargement du modèle, puis retire son brouillon. Dans le navigateur, connexion organisateur, téléchargement du modèle, sélection et import réussis : « 1 brouillon importé ; 0 ligne refusée ». Capture : `screenshots/csv-organizer.png`. Le brouillon issu du modèle reste disponible pour revue dans l’espace organisateur.

La résolution DNS Nginx du frontend est dynamique pour supporter sa recréation ; les uploads sont transmis en flux et le délai du proxy couvre la limite de traitement de l’import. Configuration Nginx testée et rechargée ; le modèle répond HTTP 200 après recréation du frontend.
