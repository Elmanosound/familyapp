-- ================================================================
-- FamilyApp — Seed budget de test
-- ~162 dépenses sur 12 mois  ·  5 enveloppes  ·  4 objectifs
-- 26 contributions             ·  6 dépenses récurrentes (3 statuts)
--
-- Prérequis : au moins 1 famille et 1 utilisateur dans la base.
-- Le script cible automatiquement le premier enregistrement trouvé.
-- Pour cibler un compte précis, remplace les deux SELECT par :
--   v_family_id := 'uuid-de-ta-famille';
--   v_user_id   := 'uuid-de-ton-user';
--
-- Exécution sur la VM :
--   docker exec -i familyapp-postgres psql -U familyapp -d familyapp < seed_budget.sql
--
-- Nettoyage (annuler le seed) :
--   DELETE FROM recurring_expenses  WHERE "familyId" = (SELECT id FROM families LIMIT 1);
--   DELETE FROM goal_contributions  WHERE "goalId" IN (SELECT id FROM budget_goals WHERE "familyId" = (SELECT id FROM families LIMIT 1));
--   DELETE FROM budget_goals        WHERE "familyId" = (SELECT id FROM families LIMIT 1);
--   DELETE FROM budget_envelopes    WHERE "familyId" = (SELECT id FROM families LIMIT 1);
--   DELETE FROM expenses            WHERE "familyId" = (SELECT id FROM families LIMIT 1);
-- ================================================================

DO $$
DECLARE
  v_family_id TEXT;
  v_user_id   TEXT;

  -- IDs fixes pour les objectifs (nécessaires pour les contributions)
  v_goal_1 TEXT := gen_random_uuid()::TEXT;  -- Vacances été
  v_goal_2 TEXT := gen_random_uuid()::TEXT;  -- Nouvelle voiture
  v_goal_3 TEXT := gen_random_uuid()::TEXT;  -- Fonds d'urgence
  v_goal_4 TEXT := gen_random_uuid()::TEXT;  -- Rénovation cuisine

BEGIN
  SELECT id INTO v_family_id FROM families LIMIT 1;
  SELECT id INTO v_user_id   FROM users    LIMIT 1;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Aucune famille trouvée — crée un compte via l''app d''abord.';
  END IF;

  RAISE NOTICE 'Seed → familyId: %  userId: %', v_family_id, v_user_id;


  -- ================================================================
  -- DÉPENSES (~162 lignes réparties sur 12 mois)
  -- ================================================================

  -- ── Loyer (1×/mois · 12 lignes) ─────────────────────────────
  INSERT INTO expenses
    (id, "familyId", amount, currency, category, description, date, "paidById", "isRecurring", "createdAt")
  SELECT
    gen_random_uuid()::TEXT,
    v_family_id,
    ROUND((880 + random() * 200)::NUMERIC, 2),
    'EUR', 'housing',
    'Loyer ' || TO_CHAR(d, 'MM/YYYY'),
    d + FLOOR(random() * 3)::INT * INTERVAL '1 day',
    v_user_id, TRUE, NOW()
  FROM generate_series(
    DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
    DATE_TRUNC('month', NOW()),
    INTERVAL '1 month'
  ) AS d;

  -- ── Courses (4×/mois · 48 lignes) ───────────────────────────
  INSERT INTO expenses
    (id, "familyId", amount, currency, category, description, date, "paidById", "isRecurring", "createdAt")
  SELECT
    gen_random_uuid()::TEXT,
    v_family_id,
    ROUND((38 + random() * 115)::NUMERIC, 2),
    'EUR', 'groceries',
    (ARRAY['Carrefour','Leclerc Drive','Lidl','Intermarché',
           'Monoprix','Marché Saint-Antoine','Biocoop','Aldi'])
      [1 + FLOOR(random() * 8)::INT],
    d + ((n - 1) * 7 + FLOOR(random() * 5)::INT) * INTERVAL '1 day',
    v_user_id, FALSE, NOW()
  FROM generate_series(
    DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
    DATE_TRUNC('month', NOW()),
    INTERVAL '1 month'
  ) AS d
  CROSS JOIN generate_series(1, 4) AS n;

  -- ── Factures / Utilities (1×/mois · 12 lignes) ──────────────
  INSERT INTO expenses
    (id, "familyId", amount, currency, category, description, date, "paidById", "isRecurring", "createdAt")
  SELECT
    gen_random_uuid()::TEXT,
    v_family_id,
    ROUND((55 + random() * 130)::NUMERIC, 2),
    'EUR', 'utilities',
    (ARRAY['EDF','Engie','Eau SAUR','Orange Fibre','SFR Box','Bouygues Télécom'])
      [1 + FLOOR(random() * 6)::INT],
    d + FLOOR(random() * 8)::INT * INTERVAL '1 day',
    v_user_id, TRUE, NOW()
  FROM generate_series(
    DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
    DATE_TRUNC('month', NOW()),
    INTERVAL '1 month'
  ) AS d;

  -- ── Transport (3×/mois · 36 lignes) ─────────────────────────
  INSERT INTO expenses
    (id, "familyId", amount, currency, category, description, date, "paidById", "isRecurring", "createdAt")
  SELECT
    gen_random_uuid()::TEXT,
    v_family_id,
    ROUND((14 + random() * 88)::NUMERIC, 2),
    'EUR', 'transport',
    (ARRAY['Essence Total','Navigo mensuel','Uber','SNCF','Péage autoroute','BlaBlaCar'])
      [1 + FLOOR(random() * 6)::INT],
    d + ((n - 1) * 10 + FLOOR(random() * 8)::INT) * INTERVAL '1 day',
    v_user_id, FALSE, NOW()
  FROM generate_series(
    DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
    DATE_TRUNC('month', NOW()),
    INTERVAL '1 month'
  ) AS d
  CROSS JOIN generate_series(1, 3) AS n;

  -- ── Restaurant (2×/mois · 24 lignes) ────────────────────────
  INSERT INTO expenses
    (id, "familyId", amount, currency, category, description, date, "paidById", "isRecurring", "createdAt")
  SELECT
    gen_random_uuid()::TEXT,
    v_family_id,
    ROUND((20 + random() * 82)::NUMERIC, 2),
    'EUR', 'dining',
    (ARRAY['Sushi Shop','McDonald''s','Bistrot du coin',
           'PizzaHut','Le Comptoir','Thaï Palace'])
      [1 + FLOOR(random() * 6)::INT],
    d + ((n - 1) * 14 + FLOOR(random() * 10)::INT) * INTERVAL '1 day',
    v_user_id, FALSE, NOW()
  FROM generate_series(
    DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
    DATE_TRUNC('month', NOW()),
    INTERVAL '1 month'
  ) AS d
  CROSS JOIN generate_series(1, 2) AS n;

  -- ── Abonnements (1×/mois · 12 lignes) ───────────────────────
  INSERT INTO expenses
    (id, "familyId", amount, currency, category, description, date, "paidById", "isRecurring", "createdAt")
  SELECT
    gen_random_uuid()::TEXT,
    v_family_id,
    ROUND((8 + random() * 25)::NUMERIC, 2),
    'EUR', 'subscriptions',
    (ARRAY['Netflix','Spotify','Disney+','Canal+','Amazon Prime','Apple One'])
      [1 + FLOOR(random() * 6)::INT],
    d + FLOOR(random() * 5)::INT * INTERVAL '1 day',
    v_user_id, TRUE, NOW()
  FROM generate_series(
    DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
    DATE_TRUNC('month', NOW()),
    INTERVAL '1 month'
  ) AS d;

  -- ── Loisirs (1×/mois · 12 lignes) ───────────────────────────
  INSERT INTO expenses
    (id, "familyId", amount, currency, category, description, date, "paidById", "isRecurring", "createdAt")
  SELECT
    gen_random_uuid()::TEXT,
    v_family_id,
    ROUND((10 + random() * 75)::NUMERIC, 2),
    'EUR', 'entertainment',
    (ARRAY['Cinéma UGC','Salle de sport','Concert','Amazon Livres','Jeu Steam','Musée'])
      [1 + FLOOR(random() * 6)::INT],
    d + FLOOR(random() * 25)::INT * INTERVAL '1 day',
    v_user_id, FALSE, NOW()
  FROM generate_series(
    DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
    DATE_TRUNC('month', NOW()),
    INTERVAL '1 month'
  ) AS d;

  -- ── Santé (ponctuel · 6 lignes) ──────────────────────────────
  INSERT INTO expenses
    (id, "familyId", amount, currency, category, description, date, "paidById", "isRecurring", "createdAt")
  VALUES
    (gen_random_uuid(), v_family_id,  25.00, 'EUR', 'health', 'Médecin généraliste',           NOW() - INTERVAL '10 months', v_user_id, FALSE, NOW()),
    (gen_random_uuid(), v_family_id,  78.50, 'EUR', 'health', 'Dentiste',                      NOW() - INTERVAL '8 months',  v_user_id, FALSE, NOW()),
    (gen_random_uuid(), v_family_id,  45.00, 'EUR', 'health', 'Opticien — verres progressifs', NOW() - INTERVAL '6 months',  v_user_id, FALSE, NOW()),
    (gen_random_uuid(), v_family_id,  32.00, 'EUR', 'health', 'Pharmacie',                     NOW() - INTERVAL '4 months',  v_user_id, FALSE, NOW()),
    (gen_random_uuid(), v_family_id, 120.00, 'EUR', 'health', 'Kinésithérapeute (5 séances)',  NOW() - INTERVAL '2 months',  v_user_id, FALSE, NOW()),
    (gen_random_uuid(), v_family_id,  18.50, 'EUR', 'health', 'Pharmacie',                     NOW() - INTERVAL '2 weeks',   v_user_id, FALSE, NOW());

  RAISE NOTICE '  -> expenses inserees : %',
    (SELECT COUNT(*) FROM expenses WHERE "familyId" = v_family_id);


  -- ================================================================
  -- BUDGET ENVELOPES (5)
  -- ================================================================
  INSERT INTO budget_envelopes
    (id, "familyId", name, "budgetedAmount", currency, period,
     category, color, icon, "isActive", "createdById", "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), v_family_id, 'Logement',    1100.00, 'EUR', 'monthly', 'housing',       '#6366f1', '🏠', TRUE, v_user_id, NOW(), NOW()),
    (gen_random_uuid(), v_family_id, 'Courses',      400.00, 'EUR', 'monthly', 'groceries',     '#22c55e', '🛒', TRUE, v_user_id, NOW(), NOW()),
    (gen_random_uuid(), v_family_id, 'Transports',   200.00, 'EUR', 'monthly', 'transport',     '#f59e0b', '🚌', TRUE, v_user_id, NOW(), NOW()),
    (gen_random_uuid(), v_family_id, 'Loisirs',      150.00, 'EUR', 'monthly', 'entertainment', '#ec4899', '🎬', TRUE, v_user_id, NOW(), NOW()),
    (gen_random_uuid(), v_family_id, 'Abonnements',   60.00, 'EUR', 'monthly', 'subscriptions', '#06b6d4', '📱', TRUE, v_user_id, NOW(), NOW());

  RAISE NOTICE '  -> budget_envelopes  : %',
    (SELECT COUNT(*) FROM budget_envelopes WHERE "familyId" = v_family_id);


  -- ================================================================
  -- BUDGET GOALS (4) + CONTRIBUTIONS (26)
  -- ================================================================
  INSERT INTO budget_goals
    (id, "familyId", name, "targetAmount", "currentAmount", currency,
     deadline, icon, "isCompleted", "createdById", "createdAt")
  VALUES
    (v_goal_1, v_family_id, 'Vacances été',        3000.00,  1500.00, 'EUR', NOW() + INTERVAL '4 months',  '✈️', FALSE, v_user_id, NOW() - INTERVAL '6 months'),
    (v_goal_2, v_family_id, 'Nouvelle voiture',   15000.00,  4500.00, 'EUR', NOW() + INTERVAL '18 months', '🚗', FALSE, v_user_id, NOW() - INTERVAL '8 months'),
    (v_goal_3, v_family_id, 'Fonds d''urgence',   10000.00,  7200.00, 'EUR', NULL,                         '🏦', FALSE, v_user_id, NOW() - INTERVAL '12 months'),
    (v_goal_4, v_family_id, 'Renovation cuisine',  8000.00,  2100.00, 'EUR', NOW() + INTERVAL '8 months',  '🍳', FALSE, v_user_id, NOW() - INTERVAL '3 months');

  INSERT INTO goal_contributions
    (id, "goalId", "userId", amount, date, note)
  VALUES
    -- Vacances ete (6 versements · total 1500)
    (gen_random_uuid(), v_goal_1, v_user_id,  300.00, NOW() - INTERVAL '6 months', 'Premier versement'),
    (gen_random_uuid(), v_goal_1, v_user_id,  250.00, NOW() - INTERVAL '5 months', NULL),
    (gen_random_uuid(), v_goal_1, v_user_id,  300.00, NOW() - INTERVAL '4 months', 'Economies avril'),
    (gen_random_uuid(), v_goal_1, v_user_id,  200.00, NOW() - INTERVAL '3 months', NULL),
    (gen_random_uuid(), v_goal_1, v_user_id,  250.00, NOW() - INTERVAL '2 months', NULL),
    (gen_random_uuid(), v_goal_1, v_user_id,  200.00, NOW() - INTERVAL '1 month',  'Bonus travail'),

    -- Nouvelle voiture (8 versements · total 4500)
    (gen_random_uuid(), v_goal_2, v_user_id,  500.00, NOW() - INTERVAL '8 months', 'Lancement du projet'),
    (gen_random_uuid(), v_goal_2, v_user_id,  500.00, NOW() - INTERVAL '7 months', NULL),
    (gen_random_uuid(), v_goal_2, v_user_id,  500.00, NOW() - INTERVAL '6 months', NULL),
    (gen_random_uuid(), v_goal_2, v_user_id,  600.00, NOW() - INTERVAL '5 months', 'Vente ancien velo'),
    (gen_random_uuid(), v_goal_2, v_user_id,  500.00, NOW() - INTERVAL '4 months', NULL),
    (gen_random_uuid(), v_goal_2, v_user_id,  500.00, NOW() - INTERVAL '3 months', NULL),
    (gen_random_uuid(), v_goal_2, v_user_id,  400.00, NOW() - INTERVAL '2 months', NULL),
    (gen_random_uuid(), v_goal_2, v_user_id,  500.00, NOW() - INTERVAL '1 month',  NULL),

    -- Fonds d'urgence (8 versements · total 7200)
    (gen_random_uuid(), v_goal_3, v_user_id, 1000.00, NOW() - INTERVAL '12 months', 'Initialisation'),
    (gen_random_uuid(), v_goal_3, v_user_id,  600.00, NOW() - INTERVAL '10 months', NULL),
    (gen_random_uuid(), v_goal_3, v_user_id,  800.00, NOW() - INTERVAL '8 months',  '13e mois'),
    (gen_random_uuid(), v_goal_3, v_user_id,  600.00, NOW() - INTERVAL '6 months',  NULL),
    (gen_random_uuid(), v_goal_3, v_user_id,  600.00, NOW() - INTERVAL '4 months',  NULL),
    (gen_random_uuid(), v_goal_3, v_user_id,  800.00, NOW() - INTERVAL '2 months',  'Prime semestrielle'),
    (gen_random_uuid(), v_goal_3, v_user_id,  800.00, NOW() - INTERVAL '3 weeks',   NULL),
    (gen_random_uuid(), v_goal_3, v_user_id,  600.00, NOW() - INTERVAL '1 week',    NULL),

    -- Renovation cuisine (3 versements · total 2100)
    (gen_random_uuid(), v_goal_4, v_user_id,  700.00, NOW() - INTERVAL '3 months', 'Demarrage travaux'),
    (gen_random_uuid(), v_goal_4, v_user_id,  700.00, NOW() - INTERVAL '2 months', NULL),
    (gen_random_uuid(), v_goal_4, v_user_id,  700.00, NOW() - INTERVAL '1 month',  NULL);

  RAISE NOTICE '  -> budget_goals      : %',
    (SELECT COUNT(*) FROM budget_goals WHERE "familyId" = v_family_id);
  RAISE NOTICE '  -> goal_contributions: %',
    (SELECT COUNT(*) FROM goal_contributions
     WHERE "goalId" IN (v_goal_1, v_goal_2, v_goal_3, v_goal_4));


  -- ================================================================
  -- RECURRING EXPENSES (6 · 3 statuts)
  -- ================================================================
  INSERT INTO recurring_expenses
    (id, "familyId", name, amount, currency, category, description,
     frequency, "startDate", "nextDueDate", "lastPaidAt",
     "isActive", "createdById", "createdAt", "updatedAt")
  VALUES
    -- A venir (> 7 jours) ─────────────────────────────────────
    (gen_random_uuid(), v_family_id,
     'Loyer',                 950.00, 'EUR', 'housing',       'Appartement T3',
     'monthly',
     NOW() - INTERVAL '11 months',
     DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
     NOW() - INTERVAL '3 days',
     TRUE, v_user_id, NOW(), NOW()),

    (gen_random_uuid(), v_family_id,
     'Netflix',                15.99, 'EUR', 'subscriptions', '4K UHD — 4 ecrans',
     'monthly',
     NOW() - INTERVAL '11 months',
     NOW() + INTERVAL '12 days',
     NOW() - INTERVAL '18 days',
     TRUE, v_user_id, NOW(), NOW()),

    -- Cette semaine (<= 7 jours) ──────────────────────────────
    (gen_random_uuid(), v_family_id,
     'Spotify Famille',        17.99, 'EUR', 'subscriptions', '6 comptes',
     'monthly',
     NOW() - INTERVAL '11 months',
     NOW() + INTERVAL '3 days',
     NOW() - INTERVAL '27 days',
     TRUE, v_user_id, NOW(), NOW()),

    (gen_random_uuid(), v_family_id,
     'Mutuelle',               62.50, 'EUR', 'health',        'Alan — famille',
     'monthly',
     NOW() - INTERVAL '11 months',
     NOW() + INTERVAL '5 days',
     NOW() - INTERVAL '25 days',
     TRUE, v_user_id, NOW(), NOW()),

    -- En retard (negatif) ─────────────────────────────────────
    (gen_random_uuid(), v_family_id,
     'Assurance habitation',   35.00, 'EUR', 'utilities',     'MMA',
     'monthly',
     NOW() - INTERVAL '11 months',
     NOW() - INTERVAL '4 days',
     NOW() - INTERVAL '34 days',
     TRUE, v_user_id, NOW(), NOW()),

    -- Annuel lointain ─────────────────────────────────────────
    (gen_random_uuid(), v_family_id,
     'Taxe fonciere',        1200.00, 'EUR', 'housing',       'Residence principale',
     'yearly',
     NOW() - INTERVAL '11 months',
     NOW() + INTERVAL '5 months',
     NOW() - INTERVAL '7 months',
     TRUE, v_user_id, NOW(), NOW());

  RAISE NOTICE '  -> recurring_expenses: %',
    (SELECT COUNT(*) FROM recurring_expenses WHERE "familyId" = v_family_id);

  RAISE NOTICE '';
  RAISE NOTICE '=== Seed termine avec succes ===';

END;
$$;


-- ================================================================
-- Verification mensuelle (executer separement apres le seed)
-- ================================================================
/*
SELECT
  TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS mois,
  COUNT(*)                                        AS nb_depenses,
  ROUND(SUM(amount)::NUMERIC, 2)                 AS total_eur
FROM expenses
WHERE "familyId" = (SELECT id FROM families LIMIT 1)
GROUP BY 1
ORDER BY 1;
*/
