import { Router } from 'express';
import { chatStatus, chatStream } from '../controllers/chat.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/status', protect, chatStatus);
router.post('/stream', protect, chatStream);

export default router;
