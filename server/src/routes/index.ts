import { Router } from 'express';
import authRoutes from './auth.routes.js';
import familyRoutes from './family.routes.js';
import calendarRoutes from './calendar.routes.js';
import listRoutes from './list.routes.js';
import messageRoutes from './message.routes.js';
import mediaRoutes from './media.routes.js';
import locationRoutes from './location.routes.js';
import budgetRoutes from './budget.routes.js';
import mealRoutes from './meal.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/families', familyRoutes);
router.use('/families/:familyId/calendar', calendarRoutes);
router.use('/families/:familyId/lists', listRoutes);
router.use('/families/:familyId/messages', messageRoutes);
router.use('/families/:familyId/media', mediaRoutes);
router.use('/families/:familyId/location', locationRoutes);
router.use('/families/:familyId/budget', budgetRoutes);
router.use('/families/:familyId/meals', mealRoutes);

export default router;
