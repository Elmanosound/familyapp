import { Router } from 'express';
import {
  getLists, createList, getListWithItems, updateList, deleteList,
  addItem, updateItem, deleteItem, shoppingToInventory,
} from '../controllers/list.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { requireFamilyMember } from '../middleware/family.middleware.js';

const router = Router({ mergeParams: true });

router.use(protect, requireFamilyMember);

router.get('/', getLists);
router.post('/', createList);
router.get('/:listId', getListWithItems);
router.patch('/:listId', updateList);
router.delete('/:listId', deleteList);
router.post('/:listId/to-inventory', shoppingToInventory);
router.post('/:listId/items', addItem);
router.patch('/:listId/items/:itemId', updateItem);
router.delete('/:listId/items/:itemId', deleteItem);

export default router;
