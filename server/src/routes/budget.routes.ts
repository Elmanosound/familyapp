import { Router } from 'express';
import {
  getExpenses, createExpense, updateExpense, deleteExpense,
  getBudgetSummary, getGoals, createGoal, contributeToGoal,
} from '../controllers/budget.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireFamilyMember } from '../middleware/family.middleware.js';

const router = Router({ mergeParams: true });

router.use(protect, requireFamilyMember);

router.get('/expenses', getExpenses);
router.post('/expenses', createExpense);
router.patch('/expenses/:expenseId', updateExpense);
router.delete('/expenses/:expenseId', deleteExpense);
router.get('/summary', getBudgetSummary);
router.get('/goals', getGoals);
router.post('/goals', createGoal);
router.post('/goals/:goalId/contribute', contributeToGoal);

export default router;
