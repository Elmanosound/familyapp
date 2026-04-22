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

const router = Router({ mergeParams: true });

router.use(protect, requireFamilyMember);

// Expenses
router.get('/expenses', getExpenses);
router.post('/expenses', createExpense);
router.patch('/expenses/:expenseId', updateExpense);
router.delete('/expenses/:expenseId', deleteExpense);

// Summary
router.get('/summary', getBudgetSummary);

// Goals
router.get('/goals', getGoals);
router.post('/goals', createGoal);
router.patch('/goals/:goalId', updateGoal);
router.delete('/goals/:goalId', deleteGoal);
router.post('/goals/:goalId/contribute', contributeToGoal);

// Envelopes
router.get('/envelopes', getEnvelopes);
router.post('/envelopes', createEnvelope);
router.patch('/envelopes/:envelopeId', updateEnvelope);
router.delete('/envelopes/:envelopeId', deleteEnvelope);

// Recurring expenses
router.get('/recurring', getRecurringExpenses);
router.post('/recurring', createRecurringExpense);
router.patch('/recurring/:recurringId', updateRecurringExpense);
router.delete('/recurring/:recurringId', deleteRecurringExpense);
router.post('/recurring/:recurringId/pay', payRecurringExpense);

// Incomes
router.get('/incomes', getIncomes);
router.post('/incomes', createIncome);
router.patch('/incomes/:incomeId', updateIncome);
router.delete('/incomes/:incomeId', deleteIncome);

export default router;
