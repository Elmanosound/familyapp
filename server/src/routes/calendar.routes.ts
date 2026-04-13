import { Router } from 'express';
import { getEvents, createEvent, updateEvent, deleteEvent } from '../controllers/calendar.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireFamilyMember } from '../middleware/family.middleware.js';

const router = Router({ mergeParams: true });

router.use(protect, requireFamilyMember);

router.get('/events', getEvents);
router.post('/events', createEvent);
router.patch('/events/:eventId', updateEvent);
router.delete('/events/:eventId', deleteEvent);

export default router;
