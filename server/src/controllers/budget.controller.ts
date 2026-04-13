import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError } from '../utils/errors.js';

export async function getExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const { category, startDate, endDate, limit = '50', skip = '0' } = req.query;

    const where: Record<string, unknown> = { familyId };
    if (category) where.category = category as string;
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          paidBy: { select: { id: true, firstName: true, lastName: true } },
          splits: { select: { userId: true } },
        },
        orderBy: { date: 'desc' },
        skip: parseInt(skip as string, 10),
        take: parseInt(limit as string, 10),
      }),
      prisma.expense.count({ where }),
    ]);

    res.json({ expenses, total });
  } catch (error) {
    next(error);
  }
}

export async function createExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const { splitBetween, ...data } = req.body;

    const expense = await prisma.expense.create({
      data: {
        amount: data.amount,
        currency: data.currency,
        category: data.category,
        description: data.description,
        date: new Date(data.date),
        receiptUrl: data.receiptUrl,
        isRecurring: data.isRecurring,
        familyId: (req.params.familyId as string),
        paidById: req.user!.id,
        ...(splitBetween?.length && {
          splits: {
            create: (splitBetween as string[]).map((userId: string) => ({ userId })),
          },
        }),
      },
      include: {
        paidBy: { select: { id: true, firstName: true, lastName: true } },
        splits: { select: { userId: true } },
      },
    });
    res.status(201).json({ expense });
  } catch (error) {
    next(error);
  }
}

export async function updateExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const { splitBetween, ...data } = req.body;
    const expenseId = (req.params.expenseId as string);

    if (data.date) data.date = new Date(data.date);

    if (splitBetween) {
      await prisma.expenseSplit.deleteMany({ where: { expenseId } });
      await prisma.expenseSplit.createMany({
        data: (splitBetween as string[]).map((userId: string) => ({ expenseId, userId })),
      });
    }

    const expense = await prisma.expense.update({
      where: { id: expenseId },
      data,
      include: {
        paidBy: { select: { id: true, firstName: true, lastName: true } },
        splits: { select: { userId: true } },
      },
    });
    res.json({ expense });
  } catch (error) {
    next(error);
  }
}

export async function deleteExpense(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.expense.delete({ where: { id: (req.params.expenseId as string) } });
    res.json({ message: 'Expense deleted' });
  } catch (error) {
    next(error);
  }
}

export async function getBudgetSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const currentMonthExpenses = await prisma.expense.findMany({
      where: { familyId, date: { gte: startOfMonth, lte: endOfMonth } },
    });

    const categoryMap = new Map<string, number>();
    let totalSpent = 0;
    for (const exp of currentMonthExpenses) {
      totalSpent += exp.amount;
      categoryMap.set(exp.category, (categoryMap.get(exp.category) || 0) + exp.amount);
    }
    const byCategory = Array.from(categoryMap.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const allExpenses = await prisma.expense.findMany({
      where: { familyId, date: { gte: twelveMonthsAgo } },
      select: { amount: true, date: true },
      orderBy: { date: 'asc' },
    });

    const monthMap = new Map<string, number>();
    for (const exp of allExpenses) {
      const key = `${exp.date.getFullYear()}-${String(exp.date.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, (monthMap.get(key) || 0) + exp.amount);
    }
    const monthlyTrend = Array.from(monthMap.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({ totalSpent, byCategory, monthlyTrend });
  } catch (error) {
    next(error);
  }
}

export async function getGoals(req: Request, res: Response, next: NextFunction) {
  try {
    const goals = await prisma.budgetGoal.findMany({
      where: { familyId: (req.params.familyId as string) },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        contributions: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ goals });
  } catch (error) {
    next(error);
  }
}

export async function createGoal(req: Request, res: Response, next: NextFunction) {
  try {
    const goal = await prisma.budgetGoal.create({
      data: {
        name: req.body.name,
        targetAmount: req.body.targetAmount,
        currency: req.body.currency,
        deadline: req.body.deadline ? new Date(req.body.deadline) : undefined,
        icon: req.body.icon,
        familyId: (req.params.familyId as string),
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ goal });
  } catch (error) {
    next(error);
  }
}

export async function contributeToGoal(req: Request, res: Response, next: NextFunction) {
  try {
    const { amount, note } = req.body;
    const goalId = (req.params.goalId as string);

    const goal = await prisma.budgetGoal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundError('Goal');

    const newAmount = goal.currentAmount + amount;

    await prisma.goalContribution.create({
      data: { goalId, userId: req.user!.id, amount, note },
    });

    const updated = await prisma.budgetGoal.update({
      where: { id: goalId },
      data: {
        currentAmount: newAmount,
        isCompleted: newAmount >= goal.targetAmount,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        contributions: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { date: 'desc' },
        },
      },
    });

    res.json({ goal: updated });
  } catch (error) {
    next(error);
  }
}
