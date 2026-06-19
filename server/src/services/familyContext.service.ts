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

// ── Topic detection — selects only the context sections the query needs ───────

type ContextTopic = 'agenda' | 'lists' | 'budget' | 'meals' | 'general';

const TOPIC_KEYWORDS: Record<ContextTopic, string[]> = {
  agenda:  ['événement', 'agenda', 'calendrier', 'rdv', 'rendez-vous', 'réunion', 'sortie', 'semaine', 'demain', 'weekend', 'prévu', 'planifié', 'fête', 'vacances', 'prochains', 'schedule', 'event'],
  lists:   ['liste', 'courses', 'acheter', 'tâche', 'todo', 'faire', 'manque', 'inventaire', 'stock', 'shopping'],
  budget:  ['budget', 'argent', 'dépense', 'revenu', 'solde', 'épargne', 'objectif', 'finance', 'coût', 'prix', 'économie'],
  meals:   ['repas', 'manger', 'dîner', 'déjeuner', 'petit-déjeuner', 'recette', 'menu', 'semaine', 'cuisine', 'plat'],
  general: [],
};

function detectTopics(message: string): Set<ContextTopic> {
  const lower = message.toLowerCase();
  const topics = new Set<ContextTopic>();

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS) as [ContextTopic, string[]][]) {
    if (topic === 'general') continue;
    if (keywords.some(kw => lower.includes(kw))) topics.add(topic);
  }

  // No specific topic detected → send everything (general question)
  if (topics.size === 0) {
    topics.add('agenda');
    topics.add('lists');
    topics.add('budget');
    topics.add('meals');
  }

  return topics;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildFamilyContext(
  userId:    string,
  familyId:  string,
  userMessage?: string,
): Promise<string | null> {

  const topics = userMessage ? detectTopics(userMessage) : new Set<ContextTopic>(['agenda', 'lists', 'budget', 'meals']);

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

  // ── 2. Parallel DB queries — only fetch what the topic requires ─────────────

  const now        = new Date();
  const twoWeeks   = new Date(now.getTime() + 14 * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const EMPTY_AGG  = { _sum: { amount: null } };

  const [events, lists, expensesAgg, incomesAgg, goals, mealPlan] = await Promise.all([

    topics.has('agenda')
      ? prisma.calendarEvent.findMany({
          where:   { familyId, startDate: { gte: now, lte: twoWeeks } },
          orderBy: { startDate: 'asc' },
          take:    6,   // 10 → 6 : ~100 tokens saved
        })
      : Promise.resolve([]),

    topics.has('lists')
      ? prisma.list.findMany({
          where:   { familyId, isArchived: false },
          include: {
            items: {
              where:   { isCompleted: false },
              orderBy: { sortOrder: 'asc' },
              take:    8,   // 15 → 8 : ~100 tokens saved
            },
          },
          take: 4,   // 6 → 4
        })
      : Promise.resolve([]),

    topics.has('budget')
      ? prisma.expense.aggregate({ where: { familyId, date: { gte: monthStart, lte: monthEnd } }, _sum: { amount: true } })
      : Promise.resolve(EMPTY_AGG),

    topics.has('budget')
      ? prisma.income.aggregate({ where: { familyId, date: { gte: monthStart, lte: monthEnd } }, _sum: { amount: true } })
      : Promise.resolve(EMPTY_AGG),

    topics.has('budget')
      ? prisma.budgetGoal.findMany({ where: { familyId, isCompleted: false }, take: 4 })
      : Promise.resolve([]),

    topics.has('meals')
      ? prisma.mealPlan.findFirst({
          where:   { familyId },
          orderBy: { weekStartDate: 'desc' },
          include: {
            meals: {
              include: { recipe: { select: { name: true } } },
              orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
            },
          },
        })
      : Promise.resolve(null),
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
  // Only render sections that were actually requested (topic-filtered).
  // Skipping empty sections keeps the prompt compact for focused queries.

  if (topics.has('agenda')) {
    lines.push('📅 AGENDA — 14 PROCHAINS JOURS');
    if (events.length === 0) {
      lines.push('  Aucun événement prévu.');
    } else {
      for (const e of events) {
        const start   = new Date(e.startDate);
        const timeStr = e.allDay ? 'toute la journée' : fmtTime(start);
        const locStr  = e.location ? ` @ ${e.location}` : '';
        lines.push(`  • ${fmtDay(start)} — ${e.title} (${timeStr})${locStr}`);
      }
    }
    lines.push('');
  }

  // ── Lists ────────────────────────────────────────────────────────────────
  if (topics.has('lists')) {
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
  }

  // ── Budget ───────────────────────────────────────────────────────────────
  if (topics.has('budget')) {
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
  }

  // ── Meal plan ────────────────────────────────────────────────────────────
  if (topics.has('meals')) {
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
  }

  lines.push('=== FIN DU CONTEXTE ===');

  return lines.join('\n');
}
