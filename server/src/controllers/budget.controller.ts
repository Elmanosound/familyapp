import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

// ─── Expenses ────────────────────────────────────────────────────────────────

export async function getExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const { category, startDate, endDate, search, limit = '50', skip = '0' } = req.query;

    const where: Record<string, unknown> = { familyId };
    if (category) where.category = category as string;
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }
    if (search) {
      where.description = { contains: search as string, mode: 'insensitive' };
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
        currency: data.currency ?? 'EUR',
        category: data.category,
        description: data.description,
        date: new Date(data.date),
        receiptUrl: data.receiptUrl,
        isRecurring: data.isRecurring ?? false,
        familyId: req.params.familyId as string,
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
    const expenseId = req.params.expenseId as string;

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
    await prisma.expense.delete({ where: { id: req.params.expenseId as string } });
    res.json({ message: 'Expense deleted' });
  } catch (error) {
    next(error);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export async function getBudgetSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const now = new Date();

    const year  = req.query.year  ? parseInt(req.query.year  as string, 10) : now.getFullYear();
    const month = req.query.month ? parseInt(req.query.month as string, 10) : now.getMonth() + 1; // 1-indexed

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth   = new Date(year, month, 0, 23, 59, 59, 999);

    const currentMonthExpenses = await prisma.expense.findMany({
      where: { familyId, date: { gte: startOfMonth, lte: endOfMonth } },
    });

    const categoryMap = new Map<string, number>();
    let totalSpent = 0;
    for (const exp of currentMonthExpenses) {
      totalSpent += exp.amount;
      categoryMap.set(exp.category, (categoryMap.get(exp.category) ?? 0) + exp.amount);
    }
    const byCategory = Array.from(categoryMap.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    // Income for current period
    const currentMonthIncomes = await prisma.income.findMany({
      where: { familyId, date: { gte: startOfMonth, lte: endOfMonth } },
      select: { amount: true },
    });
    const totalIncome = currentMonthIncomes.reduce((s, i) => s + i.amount, 0);
    const balance = totalIncome - totalSpent;
    const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

    // 12-month trend (expenses + income)
    const twelveMonthsAgo = new Date(year, month - 1 - 11, 1);
    const [allExpenses, allIncomes] = await Promise.all([
      prisma.expense.findMany({
        where: { familyId, date: { gte: twelveMonthsAgo } },
        select: { amount: true, date: true },
      }),
      prisma.income.findMany({
        where: { familyId, date: { gte: twelveMonthsAgo } },
        select: { amount: true, date: true },
      }),
    ]);

    const expMonthMap = new Map<string, number>();
    for (const exp of allExpenses) {
      const key = `${exp.date.getFullYear()}-${String(exp.date.getMonth() + 1).padStart(2, '0')}`;
      expMonthMap.set(key, (expMonthMap.get(key) ?? 0) + exp.amount);
    }
    const incMonthMap = new Map<string, number>();
    for (const inc of allIncomes) {
      const key = `${inc.date.getFullYear()}-${String(inc.date.getMonth() + 1).padStart(2, '0')}`;
      incMonthMap.set(key, (incMonthMap.get(key) ?? 0) + inc.amount);
    }
    const allKeys = new Set([...expMonthMap.keys(), ...incMonthMap.keys()]);
    const monthlyTrend = Array.from(allKeys)
      .map((m) => ({ month: m, expenses: expMonthMap.get(m) ?? 0, income: incMonthMap.get(m) ?? 0 }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({ totalSpent, totalIncome, balance, savingsRate, byCategory, monthlyTrend, period: { year, month } });
  } catch (error) {
    next(error);
  }
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export async function getGoals(req: Request, res: Response, next: NextFunction) {
  try {
    const goals = await prisma.budgetGoal.findMany({
      where: { familyId: req.params.familyId as string },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        contributions: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { date: 'desc' },
        },
      },
      orderBy: [{ isCompleted: 'asc' }, { createdAt: 'desc' }],
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
        currency: req.body.currency ?? 'EUR',
        deadline: req.body.deadline ? new Date(req.body.deadline) : undefined,
        icon: req.body.icon,
        familyId: req.params.familyId as string,
        createdById: req.user!.id,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        contributions: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    res.status(201).json({ goal });
  } catch (error) {
    next(error);
  }
}

export async function updateGoal(req: Request, res: Response, next: NextFunction) {
  try {
    const goalId = req.params.goalId as string;
    const { deadline, ...rest } = req.body;
    const goal = await prisma.budgetGoal.update({
      where: { id: goalId },
      data: {
        ...rest,
        ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        contributions: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    res.json({ goal });
  } catch (error) {
    next(error);
  }
}

export async function deleteGoal(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.budgetGoal.delete({ where: { id: req.params.goalId as string } });
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    next(error);
  }
}

export async function contributeToGoal(req: Request, res: Response, next: NextFunction) {
  try {
    const { amount, note } = req.body;
    const goalId = req.params.goalId as string;

    const goal = await prisma.budgetGoal.findUnique({ where: { id: goalId } });
    if (!goal) throw new NotFoundError('Goal');

    if (amount <= 0) throw new ValidationError('Le montant doit être positif');

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

// ─── Envelopes ───────────────────────────────────────────────────────────────

function periodBounds(period: string): { start: Date; end: Date } {
  const now = new Date();
  if (period === 'weekly') {
    const dayOfWeek = now.getDay(); // 0=Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const end = new Date(monday);
    end.setDate(monday.getDate() + 7);
    return { start: monday, end };
  }
  if (period === 'yearly') {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear() + 1, 0, 1),
    };
  }
  // monthly (default)
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

export async function getEnvelopes(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const envelopes = await prisma.budgetEnvelope.findMany({
      where: { familyId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    const result = await Promise.all(
      envelopes.map(async (env) => {
        const { start, end } = periodBounds(env.period);
        const where: Record<string, unknown> = {
          familyId,
          date: { gte: start, lt: end },
        };
        if (env.category) where.category = env.category;

        const agg = await prisma.expense.aggregate({
          where,
          _sum: { amount: true },
        });

        return { ...env, spentAmount: agg._sum.amount ?? 0 };
      }),
    );

    res.json({ envelopes: result });
  } catch (error) {
    next(error);
  }
}

export async function createEnvelope(req: Request, res: Response, next: NextFunction) {
  try {
    const envelope = await prisma.budgetEnvelope.create({
      data: {
        name: req.body.name,
        budgetedAmount: req.body.budgetedAmount,
        currency: req.body.currency ?? 'EUR',
        period: req.body.period ?? 'monthly',
        category: req.body.category ?? null,
        color: req.body.color ?? '#3b82f6',
        icon: req.body.icon ?? null,
        familyId: req.params.familyId as string,
        createdById: req.user!.id,
      },
    });

    const { start, end } = periodBounds(envelope.period);
    const where: Record<string, unknown> = {
      familyId: req.params.familyId,
      date: { gte: start, lt: end },
    };
    if (envelope.category) where.category = envelope.category;
    const agg = await prisma.expense.aggregate({ where, _sum: { amount: true } });

    res.status(201).json({ envelope: { ...envelope, spentAmount: agg._sum.amount ?? 0 } });
  } catch (error) {
    next(error);
  }
}

export async function updateEnvelope(req: Request, res: Response, next: NextFunction) {
  try {
    const envelope = await prisma.budgetEnvelope.update({
      where: { id: req.params.envelopeId as string },
      data: req.body,
    });

    const { start, end } = periodBounds(envelope.period);
    const where: Record<string, unknown> = {
      familyId: req.params.familyId,
      date: { gte: start, lt: end },
    };
    if (envelope.category) where.category = envelope.category;
    const agg = await prisma.expense.aggregate({ where, _sum: { amount: true } });

    res.json({ envelope: { ...envelope, spentAmount: agg._sum.amount ?? 0 } });
  } catch (error) {
    next(error);
  }
}

export async function deleteEnvelope(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.budgetEnvelope.delete({ where: { id: req.params.envelopeId as string } });
    res.json({ message: 'Envelope deleted' });
  } catch (error) {
    next(error);
  }
}

// ─── Recurring Expenses ───────────────────────────────────────────────────────

function advanceNextDueDate(from: Date, frequency: string): Date {
  const d = new Date(from);
  switch (frequency) {
    case 'weekly':    d.setDate(d.getDate() + 7); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

export async function getRecurringExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const recurring = await prisma.recurringExpense.findMany({
      where: { familyId: req.params.familyId as string },
      orderBy: [{ isActive: 'desc' }, { nextDueDate: 'asc' }],
    });
    res.json({ recurring });
  } catch (error) {
    next(error);
  }
}

export async function createRecurringExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const startDate = new Date(req.body.startDate);
    const recurring = await prisma.recurringExpense.create({
      data: {
        name: req.body.name,
        amount: req.body.amount,
        currency: req.body.currency ?? 'EUR',
        category: req.body.category,
        description: req.body.description ?? null,
        frequency: req.body.frequency ?? 'monthly',
        startDate,
        nextDueDate: startDate,
        familyId: req.params.familyId as string,
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ recurring });
  } catch (error) {
    next(error);
  }
}

export async function updateRecurringExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, ...rest } = req.body;
    const recurring = await prisma.recurringExpense.update({
      where: { id: req.params.recurringId as string },
      data: {
        ...rest,
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
      },
    });
    res.json({ recurring });
  } catch (error) {
    next(error);
  }
}

export async function deleteRecurringExpense(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.recurringExpense.delete({ where: { id: req.params.recurringId as string } });
    res.json({ message: 'Recurring expense deleted' });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /recurring/:recurringId/pay
 *
 * Marks the current period as paid:
 *  1. Creates an Expense record for today (linked back to the template).
 *  2. Advances nextDueDate by one period.
 *  3. Sets lastPaidAt = now.
 */
export async function payRecurringExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId  = req.params.familyId  as string;
    const recurringId = req.params.recurringId as string;

    const recurring = await prisma.recurringExpense.findUnique({ where: { id: recurringId } });
    if (!recurring) throw new NotFoundError('RecurringExpense');
    if (!recurring.isActive) throw new ValidationError('Cette dépense récurrente est désactivée');

    const now = new Date();

    // Create the actual expense record
    const expense = await prisma.expense.create({
      data: {
        familyId,
        amount: recurring.amount,
        currency: recurring.currency,
        category: recurring.category,
        description: recurring.description ?? recurring.name,
        date: now,
        isRecurring: true,
        recurringExpenseId: recurringId,
        paidById: req.user!.id,
      },
      include: {
        paidBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Advance the schedule
    const nextDueDate = advanceNextDueDate(recurring.nextDueDate, recurring.frequency);

    const updated = await prisma.recurringExpense.update({
      where: { id: recurringId },
      data: { nextDueDate, lastPaidAt: now },
    });

    res.json({ recurring: updated, expense });
  } catch (error) {
    next(error);
  }
}

// ─── Incomes ──────────────────────────────────────────────────────────────────

export async function getIncomes(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const { category, startDate, endDate, search, limit = '50', skip = '0' } = req.query;

    const where: Record<string, unknown> = { familyId };
    if (category) where.category = category as string;
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }
    if (search) {
      where.description = { contains: search as string, mode: 'insensitive' };
    }

    const [incomes, total] = await Promise.all([
      prisma.income.findMany({
        where,
        include: {
          receivedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { date: 'desc' },
        skip: parseInt(skip as string, 10),
        take: parseInt(limit as string, 10),
      }),
      prisma.income.count({ where }),
    ]);

    res.json({ incomes, total });
  } catch (error) {
    next(error);
  }
}

export async function createIncome(req: Request, res: Response, next: NextFunction) {
  try {
    const income = await prisma.income.create({
      data: {
        amount:      req.body.amount,
        currency:    req.body.currency ?? 'EUR',
        category:    req.body.category,
        description: req.body.description ?? null,
        date:        new Date(req.body.date),
        isRecurring: req.body.isRecurring ?? false,
        familyId:    req.params.familyId as string,
        receivedById: req.user!.id,
      },
      include: {
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.status(201).json({ income });
  } catch (error) {
    next(error);
  }
}

export async function updateIncome(req: Request, res: Response, next: NextFunction) {
  try {
    const { date, ...rest } = req.body;
    const income = await prisma.income.update({
      where: { id: req.params.incomeId as string },
      data: {
        ...rest,
        ...(date !== undefined && { date: new Date(date) }),
      },
      include: {
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ income });
  } catch (error) {
    next(error);
  }
}

export async function deleteIncome(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.income.delete({ where: { id: req.params.incomeId as string } });
    res.json({ message: 'Income deleted' });
  } catch (error) {
    next(error);
  }
}
