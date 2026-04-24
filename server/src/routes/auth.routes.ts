import { Router } from 'express';
import { register, login, refresh, logout, getMe, updateProfile } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { loginLimiter, authLimiter } from '../middleware/rate-limit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { RegisterSchema, LoginSchema, UpdateProfileSchema } from '../schemas/auth.schemas.js';

const router = Router();

router.post('/register', authLimiter,  validate(RegisterSchema),      register);
router.post('/login',    loginLimiter, validate(LoginSchema),         login);
router.post('/refresh',  authLimiter,                                  refresh);
router.post('/logout',   protect,                                      logout);
router.get('/me',        protect,                                      getMe);
router.patch('/profile', protect,      validate(UpdateProfileSchema), updateProfile);

export default router;
