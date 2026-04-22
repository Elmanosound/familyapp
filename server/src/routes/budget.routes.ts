import { Router } from 'express';
import {
  getExpenses, createExpense, updateExpense, deleteExpense,
  getBudgetSummary,
  getGoals, createGoal, updateGoal, deleteGoal, contributeToGoal,
  getEnvelopes, createEnvelope, updateEnvelope, deleteEnvelope,
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

export default router;
