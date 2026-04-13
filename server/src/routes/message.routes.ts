import { Router } from 'express';
import { getMessages, sendMessage, markAsRead, deleteMessage } from '../controllers/message.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireFamilyMember } from '../middleware/family.middleware.js';

const router = Router({ mergeParams: true });

router.use(protect, requireFamilyMember);

router.get('/', getMessages);
router.post('/', sendMessage);
router.post('/:messageId/read', markAsRead);
router.delete('/:messageId', deleteMessage);

export default router;
