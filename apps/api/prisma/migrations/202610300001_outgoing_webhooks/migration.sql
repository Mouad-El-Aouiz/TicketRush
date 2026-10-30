CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "webhook_endpoints_organizerId_fkey"
      FOREIGN KEY ("organizerId") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "webhook_endpoints_organizerId_active_idx"
  ON "webhook_endpoints"("organizerId", "active");
