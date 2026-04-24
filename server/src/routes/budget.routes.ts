import { Router } from 'express';
import {
  getExpenses, createExpense, updateExpense, deleteExpense,
  getBudgetSummary,
  getGoals, createGoal, updateGoal, deleteGoal, contributeToGoal,
  getEnvelopes, createEnvelope, updateEnvelope, deleteEnvelope,
  getRecurringExpenses, createRecurringExpense, updateRecurringExpense,
  deleteRecurringExpense, payRecurringExpense,
  getIncomes, createIncome, updateIncome, deleteIncome,
} from '../controllers/budget.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireFamilyMember } from '../middleware/family.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  CreateExpenseSchema,  UpdateExpenseSchema,
  CreateGoalSchema,     UpdateGoalSchema,     ContributeGoalSchema,
  CreateEnvelopeSchema, UpdateEnvelopeSchema,
  CreateRecurringSchema, UpdateRecurringSchema,
  CreateIncomeSchema,   UpdateIncomeSchema,
} from '../schemas/budget.schemas.js';

const router = Router({ mergeParams: true });

router.use(protect, requireFamilyMember);

// ── Expenses ──────────────────────────────────────────────────────────────────
router.get('/expenses',              getExpenses);
router.post('/expenses',             validate(CreateExpenseSchema), createExpense);
router.patch('/expenses/:expenseId', validate(UpdateExpenseSchema), updateExpense);
router.delete('/expenses/:expenseId',                               deleteExpense);

// ── Summary ───────────────────────────────────────────────────────────────────
router.get('/summary', getBudgetSummary);

// ── Goals ─────────────────────────────────────────────────────────────────────
router.get('/goals',                       getGoals);
router.post('/goals',                      validate(CreateGoalSchema),    createGoal);
router.patch('/goals/:goalId',             validate(UpdateGoalSchema),    updateGoal);
router.delete('/goals/:goalId',                                            deleteGoal);
router.post('/goals/:goalId/contribute',   validate(ContributeGoalSchema), contributeToGoal);

// ── Envelopes ─────────────────────────────────────────────────────────────────
router.get('/envelopes',                 getEnvelopes);
router.post('/envelopes',                validate(CreateEnvelopeSchema), createEnvelope);
router.patch('/envelopes/:envelopeId',   validate(UpdateEnvelopeSchema), updateEnvelope);
router.delete('/envelopes/:envelopeId',                                   deleteEnvelope);

// ── Recurring expenses ────────────────────────────────────────────────────────
router.get('/recurring',                     getRecurringExpenses);
router.post('/recurring',                    validate(CreateRecurringSchema), createRecurringExpense);
router.patch('/recurring/:recurringId',      validate(UpdateRecurringSchema), updateRecurringExpense);
router.delete('/recurring/:recurringId',                                       deleteRecurringExpense);
router.post('/recurring/:recurringId/pay',                                     payRecurringExpense);

// ── Incomes ───────────────────────────────────────────────────────────────────
router.get('/incomes',              getIncomes);
router.post('/incomes',             validate(CreateIncomeSchema), createIncome);
router.patch('/incomes/:incomeId',  validate(UpdateIncomeSchema), updateIncome);
router.delete('/incomes/:incomeId',                               deleteIncome);

export default router;
