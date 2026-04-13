import { Router } from 'express';
import {
  getRecipes, createRecipe, getRecipe, updateRecipe, deleteRecipe,
  getMealPlans, createOrUpdateMealPlan, generateGroceryList,
} from '../controllers/meal.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireFamilyMember } from '../middleware/family.middleware.js';

const router = Router({ mergeParams: true });

router.use(protect, requireFamilyMember);

router.get('/recipes', getRecipes);
router.post('/recipes', createRecipe);
router.get('/recipes/:recipeId', getRecipe);
router.patch('/recipes/:recipeId', updateRecipe);
router.delete('/recipes/:recipeId', deleteRecipe);
router.get('/plans', getMealPlans);
router.post('/plans', createOrUpdateMealPlan);
router.get('/plans/:planId/grocery', generateGroceryList);

export default router;
