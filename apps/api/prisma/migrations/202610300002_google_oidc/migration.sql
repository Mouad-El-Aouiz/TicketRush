ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN "googleSubject" TEXT;

CREATE UNIQUE INDEX "users_googleSubject_key" ON "users"("googleSubject");
