CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "assistant_documents" (
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_documents_pkey" PRIMARY KEY ("source_id")
);

CREATE INDEX "assistant_documents_embedding_hnsw_idx"
    ON "assistant_documents" USING hnsw ("embedding" vector_cosine_ops);
