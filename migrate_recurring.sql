-- ================================================================
-- Migration manuelle — recurring_expenses + recurringExpenseId
--
-- A exécuter UNE SEULE FOIS avant le seed, si le container
-- n'a pas encore été reconstruit avec la branche feat/budget-v2.
-- Après un rebuild Docker, ces tables existent déjà via prisma db push.
--
-- Exécution :
--   docker exec -i familyapp-postgres psql -U familyapp -d familyapp < migrate_recurring.sql
-- ================================================================

-- 1. Table recurring_expenses ─────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id             TEXT             NOT NULL,
  "familyId"     TEXT             NOT NULL,
  name           TEXT             NOT NULL,
  amount         DOUBLE PRECISION NOT NULL,
  currency       TEXT             NOT NULL DEFAULT 'EUR',
  category       TEXT             NOT NULL,
  description    TEXT,
  frequency      TEXT             NOT NULL DEFAULT 'monthly',
  "startDate"    TIMESTAMP(3)     NOT NULL,
  "nextDueDate"  TIMESTAMP(3)     NOT NULL,
  "lastPaidAt"   TIMESTAMP(3),
  "isActive"     BOOLEAN          NOT NULL DEFAULT TRUE,
  "createdById"  TEXT             NOT NULL,
  "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT recurring_expenses_pkey
    PRIMARY KEY (id),
  CONSTRAINT recurring_expenses_familyId_fkey
    FOREIGN KEY ("familyId") REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT recurring_expenses_createdById_fkey
    FOREIGN KEY ("createdById") REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS "recurring_expenses_familyId_nextDueDate_idx"
  ON recurring_expenses ("familyId", "nextDueDate");

-- 2. Colonne recurringExpenseId dans expenses ─────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS "recurringExpenseId" TEXT;

-- 3. Clé étrangère (si elle n'existe pas déjà) ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'expenses_recurringExpenseId_fkey'
      AND table_name      = 'expenses'
  ) THEN
    ALTER TABLE expenses
      ADD CONSTRAINT "expenses_recurringExpenseId_fkey"
      FOREIGN KEY ("recurringExpenseId")
      REFERENCES recurring_expenses(id) ON DELETE SET NULL;
  END IF;
END;
$$;

SELECT 'Migration OK — recurring_expenses prete.' AS status;
