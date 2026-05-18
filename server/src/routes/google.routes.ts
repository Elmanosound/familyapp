import { Router } from 'express';
import {
  googleAuthUrl,
  googleAuthCallback,
  googleStatus,
  googleDisconnect,
  updateGoogleSourceEvent,
  deleteGoogleSourceEvent,
} from '../controllers/google.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

// OAuth flow
router.get('/auth-url',            protect, googleAuthUrl);      // returns JSON { url }
router.get('/callback',                     googleAuthCallback);

// Status & disconnect
router.get('/status',              protect, googleStatus);
router.delete('/disconnect',       protect, googleDisconnect);

// Google-sourced event CRUD (no FamilyApp DB involved)
router.patch('/events/:googleEventId',  protect, updateGoogleSourceEvent);
router.delete('/events/:googleEventId', protect, deleteGoogleSourceEvent);

export default router;
