import { Router } from 'express';
import { register, login, refresh, logout, getMe, updateProfile } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { loginLimiter, authLimiter } from '../middleware/rate-limit.middleware.js';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login',    loginLimiter, login);
router.post('/refresh',  authLimiter,  refresh);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.patch('/profile', protect, updateProfile);

export default router;
