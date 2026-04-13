import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError } from '../utils/errors.js';

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
