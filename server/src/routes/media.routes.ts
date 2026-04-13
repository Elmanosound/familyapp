import { Router } from 'express';
import {
  getMedia, uploadMedia, uploadFile, deleteMedia, toggleLike, addComment,
  getAlbums, createAlbum, deleteAlbum,
} from '../controllers/media.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireFamilyMember } from '../middleware/family.middleware.js';
import { uploadSingle } from '../middleware/upload.js';

const router = Router({ mergeParams: true });

router.use(protect, requireFamilyMember);

router.get('/', getMedia);
router.post('/upload', uploadSingle, uploadFile);
router.post('/upload-json', uploadMedia); // keep the JSON-only endpoint
router.delete('/:mediaId', deleteMedia);
router.post('/:mediaId/like', toggleLike);
router.post('/:mediaId/comments', addComment);
router.get('/albums', getAlbums);
router.post('/albums', createAlbum);
router.delete('/albums/:albumId', deleteAlbum);

export default router;
