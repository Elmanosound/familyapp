import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const userNameSelect = { id: true, firstName: true, lastName: true };

export async function getLists(req: Request, res: Response, next: NextFunction) {
  try {
    const lists = await prisma.list.findMany({
      where: { familyId: (req.params.familyId as string), isArchived: false },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { items: true } },
      },
    });

    const listsWithCounts = await Promise.all(
      lists.map(async (list) => {
        const completedCount = await prisma.listItem.count({
          where: { listId: list.id, isCompleted: true },
        });
        const { _count, ...rest } = list as typeof list & { _count: { items: number } };
        return { ...rest, itemCount: _count.items, completedCount };
      })
    );

    res.json({ lists: listsWithCounts });
  } catch (error) {
    next(error);
  }
}

export async function createList(req: Request, res: Response, next: NextFunction) {
  try {
    const list = await prisma.list.create({
      data: {
        name: req.body.name,
        type: req.body.type,
        icon: req.body.icon,
        color: req.body.color,
        sortOrder: req.body.sortOrder,
        familyId: (req.params.familyId as string),
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ list });
  } catch (error) {
    next(error);
  }
}

export async function getListWithItems(req: Request, res: Response, next: NextFunction) {
  try {
    const list = await prisma.list.findUnique({
      where: { id: (req.params.listId as string) },
    });
    if (!list) throw new NotFoundError('List');

    const items = await prisma.listItem.findMany({
      where: { listId: list.id },
      include: {
        addedBy: { select: userNameSelect },
        assignedTo: { select: userNameSelect },
        completedBy: { select: userNameSelect },
      },
      orderBy: [{ isCompleted: 'asc' }, { sortOrder: 'asc' }],
    });

    res.json({ list, items });
  } catch (error) {
    next(error);
  }
}

export async function updateList(req: Request, res: Response, next: NextFunction) {
  try {
    const list = await prisma.list.update({
      where: { id: (req.params.listId as string) },
      data: req.body,
    });
    res.json({ list });
  } catch (error) {
    next(error);
  }
}

export async function deleteList(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.list.delete({ where: { id: (req.params.listId as string) } });
    res.json({ message: 'List deleted' });
  } catch (error) {
    next(error);
  }
}

export async function addItem(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await prisma.listItem.create({
      data: {
        text: req.body.text,
        category: req.body.category,
        quantity: req.body.quantity,
        unit: req.body.unit,
        sortOrder: req.body.sortOrder,
        assignedToId: req.body.assignedTo,
        listId: (req.params.listId as string),
        familyId: (req.params.familyId as string),
        addedById: req.user!.id,
      },
    });
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
}

export async function updateItem(req: Request, res: Response, next: NextFunction) {
  try {
    const { isCompleted, assignedTo, ...rest } = req.body;
    const updates: Record<string, unknown> = { ...rest };

    if (assignedTo !== undefined) updates.assignedToId = assignedTo;
    if (isCompleted !== undefined) {
      updates.isCompleted = isCompleted;
      updates.completedById = isCompleted ? req.user!.id : null;
      updates.completedAt = isCompleted ? new Date() : null;
    }

    const item = await prisma.listItem.update({
      where: { id: (req.params.itemId as string) },
      data: updates,
    });
    res.json({ item });
  } catch (error) {
    next(error);
  }
}

export async function deleteItem(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.listItem.delete({ where: { id: (req.params.itemId as string) } });
    res.json({ message: 'Item deleted' });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /families/:familyId/lists/:listId/to-inventory
 *
 * Takes the completed (checked) items from a shopping list and merges them
 * into the family's inventory list. If an item with the same name already
 * exists in the inventory, its quantity is incremented; otherwise a new
 * item is created. Items that don't have a category get "Epicerie" by
 * default. After transfer, the completed items are removed from the
 * shopping list.
 */
export async function shoppingToInventory(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const listId = req.params.listId as string;

    // 1. Validate: source must be a shopping list.
    const sourceList = await prisma.list.findUnique({ where: { id: listId } });
    if (!sourceList) throw new NotFoundError('List');
    if (sourceList.type !== 'shopping') {
      throw new ValidationError("Seule une liste de courses peut etre transferee vers l'inventaire");
    }

    // 2. Get completed items from the shopping list.
    const completedItems = await prisma.listItem.findMany({
      where: { listId, isCompleted: true },
    });
    if (completedItems.length === 0) {
      throw new ValidationError("Aucun element coche a transferer");
    }

    // 3. Find or create the inventory list for this family.
    let inventory = await prisma.list.findFirst({
      where: { familyId, type: 'inventory', isArchived: false },
    });
    if (!inventory) {
      inventory = await prisma.list.create({
        data: {
          name: 'Inventaire maison',
          type: 'inventory',
          familyId,
          createdById: req.user!.id,
        },
      });
    }

    // 4. Load existing inventory items to detect duplicates by name.
    const existingItems = await prisma.listItem.findMany({
      where: { listId: inventory.id },
    });
    const existingByName = new Map(
      existingItems.map((item) => [item.text.toLowerCase().trim(), item]),
    );

    // Default category for items without one.
    const DEFAULT_CATEGORY = 'Epicerie';

    // 5. Upsert in a transaction.
    await prisma.$transaction(async (tx) => {
      for (const item of completedItems) {
        const key = item.text.toLowerCase().trim();
        const existing = existingByName.get(key);

        if (existing) {
          // Increment quantity on the existing inventory item.
          await tx.listItem.update({
            where: { id: existing.id },
            data: {
              quantity: (existing.quantity ?? 0) + (item.quantity ?? 1),
            },
          });
        } else {
          // Create a new inventory item.
          await tx.listItem.create({
            data: {
              listId: inventory.id,
              familyId,
              text: item.text,
              quantity: item.quantity ?? 1,
              unit: item.unit ?? undefined,
              category: DEFAULT_CATEGORY,
              addedById: req.user!.id,
            },
          });
        }
      }

      // 6. Remove the transferred items from the shopping list.
      await tx.listItem.deleteMany({
        where: {
          listId,
          isCompleted: true,
        },
      });
    });

    res.json({
      message: 'Produits ajoutes a l\'inventaire',
      transferredCount: completedItems.length,
    });
  } catch (error) {
    next(error);
  }
}
