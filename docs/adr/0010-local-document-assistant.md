# ADR 0010 — Assistant documentaire local avec pgvector et Ollama

## Contexte

La dernière extension pédagogique demande une recherche RAG sur les FAQ et les descriptions d'événements, puis des outils en lecture vers le catalogue public. L'hébergement et le traitement doivent rester locaux. Le service doit démarrer même si aucun modèle n'est installé.

## Décision

PostgreSQL conserve les documents et leurs embeddings dans une table gérée par SQL, avec l'extension pgvector et un index HNSW cosine. Les vecteurs ont 768 dimensions pour correspondre au modèle d'embedding Ollama par défaut; toute autre valeur de `OLLAMA_EMBEDDING_MODEL` doit renvoyer le même nombre de dimensions. Le service NestJS synchronise les FAQ et les descriptions des événements publiés et futurs par empreinte de contenu. Les requêtes et les documents utilisent le même modèle d'embedding Ollama. Le modèle de chat renvoie une réponse structurée avec identifiants de sources; l'API élimine les citations qui ne correspondent pas aux documents récupérés ou aux résultats d'outils.

Ollama s'exécute sur la machine ou dans le service Docker optionnel `compose.ai.yaml`. Les variables restent vides par défaut; les modèles ne sont jamais téléchargés par les scripts de démarrage. La configuration n'accepte qu'un endpoint Ollama local. L'API propose deux outils strictement en lecture : recherche d'événements publiés et consultation d'un événement publié. Aucun outil d'achat, de paiement, de compte ou de billet privé n'est fourni.

Les références et résultats du catalogue sont considérés comme non fiables dans le prompt. La sortie est validée par Zod, les sources sont filtrées et l'endpoint est limité à 10 demandes par minute et par adresse. Ces barrières limitent les effets d'une injection de prompt; elles ne garantissent pas qu'un modèle local produira toujours une réponse exacte.

## Alternatives considérées

- Une API d'IA hébergée aurait simplifié l'accès aux modèles, mais aurait envoyé les questions et le contenu indexé à un fournisseur externe; le choix local respecte la décision de garder le projet sur la machine.
- Une recherche textuelle PostgreSQL aurait évité les embeddings, mais ne pratique pas la recherche sémantique visée par cette phase.
- Une vectorisation en mémoire aurait évité l'extension, mais aurait perdu l'index au redémarrage et se serait moins rapprochée du besoin pgvector du référentiel.
- L'index HNSW est utile quand le catalogue grandit; pour les cinq FAQ et un petit catalogue, une recherche séquentielle aurait suffi au MVP. HNSW est retenu pour pratiquer l'index vectoriel demandé.

## Conséquences

- L'image PostgreSQL locale inclut pgvector; une migration crée l'extension, la table et l'index.
- L'assistant est désactivé tant qu'`OLLAMA_BASE_URL` n'est pas défini.
- L'index des FAQ et du catalogue est rafraîchi à la demande; seule une modification de contenu ou de modèle déclenche un nouvel embedding.
- Le premier appel peut être lent, car il charge les modèles et indexe les événements publiés. Le choix et le téléchargement des modèles restent sous le contrôle de l'utilisateur.
- Les contenus ne quittent pas la machine lorsqu'Ollama est configuré localement.

Références : [pgvector](https://github.com/pgvector/pgvector), [Ollama embeddings](https://docs.ollama.com/capabilities/embeddings), [Ollama tool calling](https://github.com/ollama/ollama/blob/main/docs/capabilities/tool-calling.mdx), [Ollama structured output](https://docs.ollama.com/api/chat).
