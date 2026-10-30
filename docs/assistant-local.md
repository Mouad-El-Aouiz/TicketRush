# Assistant documentaire local

L'assistant indexe les FAQ de `apps/api/src/assistant/knowledge.ts` et les descriptions des événements publiés à venir. PostgreSQL/pgvector stocke des vecteurs de 768 dimensions avec un index HNSW; Ollama fournit les embeddings et la génération, sans compte cloud. Le modèle d'embedding configuré doit renvoyer 768 dimensions, comme le modèle par défaut `embeddinggemma`.

Par défaut, le bouton « Aide IA » explique que le service est désactivé. Pour utiliser Ollama installé directement sur la machine, installer Ollama, télécharger les modèles manuellement, puis définir dans le `.env` :

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=qwen3:4b
OLLAMA_EMBEDDING_MODEL=embeddinggemma
```

Télécharger les modèles avant le premier appel :

```powershell
ollama pull qwen3:4b
ollama pull embeddinggemma
```

Pour exécuter aussi Ollama dans Docker, le profil optionnel ajoute un conteneur et un volume de modèles. L'image Ollama est volumineuse; cette commande est opt-in et ne télécharge pas les modèles :

```powershell
docker compose -f compose.yaml -f compose.app.yaml -f compose.ai.yaml --profile ai up -d --build --wait
docker compose -f compose.yaml -f compose.app.yaml -f compose.ai.yaml --profile ai exec ollama ollama pull qwen3:4b
docker compose -f compose.yaml -f compose.app.yaml -f compose.ai.yaml --profile ai exec ollama ollama pull embeddinggemma
```

Avec ce profil, l'API contacte `http://ollama:11434` sur le réseau Docker. Le mode Docker CPU peut être lent; Ollama installé nativement peut utiliser le matériel local disponible. Les noms des modèles sont configurables dans `OLLAMA_CHAT_MODEL` et `OLLAMA_EMBEDDING_MODEL`.

L'API expose `GET /api/assistant/status` et `POST /api/assistant/ask` (`{ "question": "..." }`). Les outils du modèle peuvent uniquement rechercher des événements publics ou lire leurs détails. Les prix proviennent du catalogue; l'assistant ne prétend pas connaître le stock instantané. Les citations renvoyées sont recoupées par l'API avec les sources réellement récupérées. Le premier appel indexe jusqu'à 200 événements et les FAQ; les suivants ne recalculent que les documents modifiés.

La taille des modèles et le premier indexage affectent le temps de réponse et l'espace disque. Aucun modèle, image Ollama ou service cloud n'est téléchargé ou lancé par défaut.
