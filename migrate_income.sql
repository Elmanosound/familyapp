-- ================================================================
-- Migration manuelle — incomes
--
-- A exécuter UNE SEULE FOIS avant le seed, si le container
-- n'a pas encore été reconstruit avec la branche feat/budget-v2.
-- Après un rebuild Docker, cette table existe déjà via prisma db push.
--
-- Exécution :
--   docker exec -i familyapp-postgres psql -U familyapp -d familyapp < migrate_income.sql
-- ================================================================

CREATE TABLE IF NOT EXISTS incomes (
  id             TEXT             NOT NULL,
  "familyId"     TEXT             NOT NULL,
  amount         DOUBLE PRECISION NOT NULL,
  currency       TEXT             NOT NULL DEFAULT 'EUR',
  category       TEXT             NOT NULL,
  description    TEXT,
  date           TIMESTAMP(3)     NOT NULL,
  "receivedById" TEXT             NOT NULL,
  "isRecurring"  BOOLEAN          NOT NULL DEFAULT FALSE,
  "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT incomes_pkey
    PRIMARY KEY (id),
  CONSTRAINT "incomes_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT "incomes_receivedById_fkey"
    FOREIGN KEY ("receivedById") REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS "incomes_familyId_date_idx"
  ON incomes ("familyId", date DESC);

SELECT 'Migration OK — incomes prete.' AS status;
