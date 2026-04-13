import { Router } from 'express';
import {
  getMemberLocations, updateLocation,
  getGeofences, createGeofence, updateGeofence, deleteGeofence,
} from '../controllers/location.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireFamilyMember } from '../middleware/family.middleware.js';

const router = Router({ mergeParams: true });

router.use(protect, requireFamilyMember);

router.get('/members', getMemberLocations);
router.post('/update', updateLocation);
router.get('/geofences', getGeofences);
router.post('/geofences', createGeofence);
router.patch('/geofences/:geofenceId', updateGeofence);
router.delete('/geofences/:geofenceId', deleteGeofence);

export default router;
