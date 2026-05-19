/**
 * familyContext.service.ts
 *
 * Builds a natural-language context block that is injected at the top of the
 * LM Studio system prompt when the user enables "Mode Famille" in FamilyBot.
 *
 * The context includes:
 *  - Family name and member list
 *  - Upcoming calendar events (next 14 days)
 *  - Active lists with their pending items
 *  - Current-month budget summary (income / expenses / balance + goals)
 *  - This week's meal plan
 *
 * Returns null if the user is not a member of the requested family.
 */

import { prisma } from '../config/db.js';

// ── Date helpers (no external dep — Intl is built-in) ─────────────────────────

const localeFR = 'fr-FR';

const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat(localeFR, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat(localeFR, { hour: '2-digit', minute: '2-digit' }).format(d);

const fmtMonthYear = (d: Date) =>
  new Intl.DateTimeFormat(localeFR, { month: 'long', year: 'numeric' }).format(d);

const fmtCurrency = (n: number) =>
  n.toLocaleString(localeFR, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const MEAL_TYPE_FR: Record<string, string> = {
  breakfast: 'Petit-déjeuner',
  lunch:     'Déjeuner',
  dinner:    'Dîner',
  snack:     'Collation',
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildFamilyContext(
  userId:   string,
  familyId: string,
): Promise<string | null> {

  // ── 1. Verify membership ─────────────────────────────────────────────────

  const membership = await prisma.familyMember.findFirst({
    where: { userId, familyId },
    include: {
      family: {
        include: {
          members: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  if (!membership) return null;

  // ── 2. Parallel DB queries ───────────────────────────────────────────────

  const now         = new Date();
  const twoWeeks    = new Date(now.getTime() + 14 * 86_400_000);
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd    = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [events, lists, expensesAgg, incomesAgg, goals, mealPlan] = await Promise.all([

    // Upcoming calendar events
    prisma.calendarEvent.findMany({
      where: { familyId, startDate: { gte: now, lte: twoWeeks } },
      orderBy: { startDate: 'asc' },
      take: 12,
    }),

    // Active lists + their unchecked items
    prisma.list.findMany({
      where: { familyId, isArchived: false },
      include: {
        items: {
          where:   { isCompleted: false },
          orderBy: { sortOrder: 'asc' },
          take:    20,
        },
      },
      take: 8,
    }),

    // Current-month expenses (total)
    prisma.expense.aggregate({
      where: { familyId, date: { gte: monthStart, lte: monthEnd } },
      _sum:  { amount: true },
    }),

    // Current-month incomes (total)
    prisma.income.aggregate({
      where: { familyId, date: { gte: monthStart, lte: monthEnd } },
      _sum:  { amount: true },
    }),

    // Active savings goals
    prisma.budgetGoal.findMany({
      where: { familyId, isCompleted: false },
      take:  5,
    }),

    // Most recent meal plan with its slots
    prisma.mealPlan.findFirst({
      where:   { familyId },
      orderBy: { weekStartDate: 'desc' },
      include: {
        meals: {
          include: { recipe: { select: { name: true } } },
          orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
        },
      },
    }),
  ]);

  // ── 3. Assemble context block ────────────────────────────────────────────

  const { family } = membership;
  const members    = family.members;
  const lines: string[] = [];

  lines.push('=== CONTEXTE DE LA FAMILLE ===');
  lines.push(
    `Famille : "${family.name}" (${members.length} membre${members.length > 1 ? 's' : ''})`,
  );
  lines.push(
    `Membres : ${members
      .map(m => `${m.user.firstName} ${m.user.lastName} [${m.role}]`)
      .join(', ')}`,
  );
  lines.push(`Date : ${fmtDay(now)} ${now.getFullYear()}`);
  lines.push('');

  // ── Agenda ──────────────────────────────────────────────────────────────
  lines.push('📅 AGENDA — 14 PROCHAINS JOURS');
  if (events.length === 0) {
    lines.push('  Aucun événement prévu.');
  } else {
    for (const e of events) {
      const start    = new Date(e.startDate);
      const timeStr  = e.allDay ? 'toute la journée' : fmtTime(start);
      const locStr   = e.location ? ` @ ${e.location}` : '';
      lines.push(`  • ${fmtDay(start)} — ${e.title} (${timeStr})${locStr}`);
    }
  }
  lines.push('');

  // ── Lists ────────────────────────────────────────────────────────────────
  lines.push('📋 LISTES ACTIVES');
  const listsWithItems = lists.filter(l => l.items.length > 0);
  if (listsWithItems.length === 0) {
    lines.push('  Toutes les listes sont vides ou archivées.');
  } else {
    for (const list of listsWithItems) {
      const items = list.items.map(i => i.text).join(', ');
      lines.push(`  • ${list.name} (${list.items.length} élément${list.items.length > 1 ? 's' : ''}) : ${items}`);
    }
  }
  lines.push('');

  // ── Budget ───────────────────────────────────────────────────────────────
  const totalExpenses = expensesAgg._sum.amount ?? 0;
  const totalIncome   = incomesAgg._sum.amount  ?? 0;
  const balance       = totalIncome - totalExpenses;
  const sign          = balance >= 0 ? '+' : '';

  lines.push(`💰 BUDGET — ${fmtMonthYear(now).toUpperCase()}`);
  lines.push(
    `  Revenus : ${fmtCurrency(totalIncome)}  |  Dépenses : ${fmtCurrency(totalExpenses)}  |  Solde : ${sign}${fmtCurrency(balance)}`,
  );
  if (goals.length > 0) {
    lines.push('  Objectifs d\'épargne :');
    for (const g of goals) {
      const pct = g.targetAmount > 0
        ? Math.round((g.currentAmount / g.targetAmount) * 100)
        : 0;
      const deadline = g.deadline
        ? ` (échéance : ${fmtDay(new Date(g.deadline))})`
        : '';
      lines.push(
        `    – ${g.name}${deadline} : ${fmtCurrency(g.currentAmount)} / ${fmtCurrency(g.targetAmount)} (${pct} %)`,
      );
    }
  }
  lines.push('');

  // ── Meal plan ────────────────────────────────────────────────────────────
  lines.push('🍽️  PLAN DE REPAS (semaine en cours)');
  if (!mealPlan || mealPlan.meals.length === 0) {
    lines.push('  Aucun plan de repas défini.');
  } else {
    const weekStart = new Date(mealPlan.weekStartDate);
    for (const slot of mealPlan.meals) {
      const dayDate   = new Date(weekStart.getTime() + slot.dayOfWeek * 86_400_000);
      const mealName  = slot.recipe?.name ?? slot.customMealName ?? '—';
      const typeLabel = MEAL_TYPE_FR[slot.mealType] ?? slot.mealType;
      lines.push(`  • ${fmtDay(dayDate)} ${typeLabel} : ${mealName}`);
    }
  }
  lines.push('');

  lines.push('=== FIN DU CONTEXTE ===');

  return lines.join('\n');
}
