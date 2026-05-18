-- CreateTable
CREATE TABLE "google_tokens" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "accessToken"  TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "googleEmail"  TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_tokens_userId_key" ON "google_tokens"("userId");

-- AddForeignKey
ALTER TABLE "google_tokens" ADD CONSTRAINT "google_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add googleEventId to calendar_events
ALTER TABLE "calendar_events" ADD COLUMN "googleEventId" TEXT;
