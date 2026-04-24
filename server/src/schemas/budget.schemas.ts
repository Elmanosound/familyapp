import { z } from 'zod';

// ── Shared primitives ─────────────────────────────────────────────────────────

/** Validates that a string can be parsed as a date. */
const isoDate = z
  .string({ required_error: 'La date est requise' })
  .min(1, 'La date est requise')
  .refine((v) => !isNaN(Date.parse(v)), { message: 'Date invalide' });

/** Positive non-zero monetary amount. */
const positiveAmount = z
  .number({ required_error: 'Le montant est requis', invalid_type_error: 'Le montant doit être un nombre' })
  .positive('Le montant doit être positif');

/** ISO 4217 currency code (3 chars). Defaults in the controllers to "EUR". */
const currency = z.string().length(3, 'Code devise invalide (ex: EUR)').optional();

// ── Expenses ──────────────────────────────────────────────────────────────────

export const CreateExpenseSchema = z.object({
  amount:       positiveAmount,
  currency:     currency,
  category:     z.string().min(1, 'La catégorie est requise').max(50),
  description:  z.string().max(500).optional(),
  date:         isoDate,
  receiptUrl:   z.string().url('URL reçu invalide').optional().or(z.literal('')),
  isRecurring:  z.boolean().optional(),
  splitBetween: z.array(z.string().uuid('ID utilisateur invalide')).optional(),
});

/** All fields optional — only provided fields are updated. */
export const UpdateExpenseSchema = CreateExpenseSchema.partial();

// ── Goals ─────────────────────────────────────────────────────────────────────

export const CreateGoalSchema = z.object({
  name:         z.string().min(1, 'Le nom est requis').max(100),
  targetAmount: positiveAmount,
  currency:     currency,
  deadline:     isoDate.optional(),
  icon:         z.string().max(10).optional(),
});

export const UpdateGoalSchema = CreateGoalSchema.partial();

export const ContributeGoalSchema = z.object({
  amount: positiveAmount,
  note:   z.string().max(200).optional(),
});

// ── Envelopes ─────────────────────────────────────────────────────────────────

const PeriodEnum = z.enum(['monthly', 'weekly', 'yearly'], {
  errorMap: () => ({ message: "Période invalide — 'monthly', 'weekly' ou 'yearly'" }),
});

export const CreateEnvelopeSchema = z.object({
  name:           z.string().min(1, 'Le nom est requis').max(100),
  budgetedAmount: positiveAmount,
  currency:       currency,
  period:         PeriodEnum.optional(),
  category:       z.string().max(50).optional(),
  color:          z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex invalide (ex: #3b82f6)').optional(),
  icon:           z.string().max(10).optional(),
});

export const UpdateEnvelopeSchema = CreateEnvelopeSchema.partial();

// ── Recurring expenses ────────────────────────────────────────────────────────

const FrequencyEnum = z.enum(['weekly', 'monthly', 'quarterly', 'yearly'], {
  errorMap: () => ({ message: "Fréquence invalide — 'weekly', 'monthly', 'quarterly' ou 'yearly'" }),
});

export const CreateRecurringSchema = z.object({
  name:        z.string().min(1, 'Le nom est requis').max(100),
  amount:      positiveAmount,
  currency:    currency,
  category:    z.string().min(1, 'La catégorie est requise').max(50),
  description: z.string().max(500).optional(),
  frequency:   FrequencyEnum.optional(),
  startDate:   isoDate,
});

export const UpdateRecurringSchema = CreateRecurringSchema.partial();

// ── Incomes ───────────────────────────────────────────────────────────────────

const IncomeCategoryEnum = z.enum(
  ['salary', 'freelance', 'rental', 'investment', 'gift', 'other'],
  { errorMap: () => ({ message: 'Catégorie de revenu invalide' }) },
);

export const CreateIncomeSchema = z.object({
  amount:      positiveAmount,
  currency:    currency,
  category:    IncomeCategoryEnum,
  description: z.string().max(500).optional(),
  date:        isoDate,
  isRecurring: z.boolean().optional(),
});

export const UpdateIncomeSchema = CreateIncomeSchema.partial();
