import { Router } from 'express';
import {
  createFamily, getFamilies, getFamily, updateFamily, deleteFamily,
  inviteMember, acceptInvitation, removeMember, switchFamily,
} from '../controllers/family.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireFamilyMember, requireFamilyAdmin } from '../middleware/family.middleware.js';

const router = Router();

router.use(protect);

router.post('/', createFamily);
router.get('/', getFamilies);
router.get('/:familyId', requireFamilyMember, getFamily);
router.patch('/:familyId', requireFamilyAdmin, updateFamily);
router.delete('/:familyId', requireFamilyAdmin, deleteFamily);
router.post('/:familyId/invite', requireFamilyAdmin, inviteMember);
router.post('/:familyId/switch', requireFamilyMember, switchFamily);
router.delete('/:familyId/members/:userId', requireFamilyAdmin, removeMember);

// Invitation routes (separate because token-based)
router.post('/invitations/:token/accept', acceptInvitation);

export default router;
