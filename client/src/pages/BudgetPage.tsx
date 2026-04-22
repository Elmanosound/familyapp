import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wallet, Plus, TrendingUp, Target, ChevronLeft, ChevronRight,
  Pencil, Trash2, PiggyBank, Package, Search, CheckCircle2,
  AlertTriangle, TrendingDown, Calendar, Repeat, Banknote,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';
import type {
  Expense, BudgetGoal, BudgetEnvelope, BudgetSummary,
  RecurringExpense, Income,
} from '@familyapp/shared';
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, INCOME_CATEGORY_LABELS,
  RECURRING_FREQUENCY_LABELS, RECURRING_MONTHLY_FACTOR,
} from '@familyapp/shared';
import { format, addMonths, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  groceries: 'Courses', utilities: 'Factures', transport: 'Transport',
  entertainment: 'Loisirs', health: 'Santé', education: 'Éducation',
  clothing: 'Vêtements', housing: 'Logement', dining: 'Restaurant',
  subscriptions: 'Abonnements', other: 'Autre',
};
const CATEGORY_COLORS: Record<string, string> = {
  groceries: '#22c55e', utilities: '#3b82f6', transport: '#f59e0b',
  entertainment: '#ec4899', health: '#ef4444', education: '#8b5cf6',
  clothing: '#14b8a6', housing: '#6366f1', dining: '#f97316',
  subscriptions: '#06b6d4', other: '#6b7280',
};
const INCOME_COLORS: Record<string, string> = {
  salary: '#22c55e', freelance: '#3b82f6', rental: '#f59e0b',
  investment: '#8b5cf6', gift: '#ec4899', other: '#6b7280',
};
const GOAL_EMOJIS = [
  '🏠', '🚗', '✈️', '🏖️', '🎓', '💒', '👶', '💻',
  '🏋️', '🎸', '🎮', '📱', '🐕', '🌴', '💎', '🏔️',
  '🚀', '🎯', '🛥️', '🎨', '🍕', '🏥', '⚡', '🌱',
];
const ENVELOPE_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];
const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensuel', weekly: 'Hebdo', yearly: 'Annuel',
};
const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function envelopeColor(spent: number, budget: number) {
  const pct = budget > 0 ? spent / budget : 0;
  if (pct >= 1) return 'text-red-500';
  if (pct >= 0.7) return 'text-orange-500';
  return 'text-green-600';
}
function envelopeBg(spent: number, budget: number) {
  const pct = budget > 0 ? spent / budget : 0;
  if (pct >= 1) return 'bg-red-500';
  if (pct >= 0.7) return 'bg-orange-400';
  return 'bg-green-500';
}

function daysUntilDue(nextDueDate: string): number {
  return Math.round((new Date(nextDueDate).getTime() - Date.now()) / 86_400_000);
}

function recurringStatus(nextDueDate: string): 'overdue' | 'soon' | 'upcoming' {
  const d = daysUntilDue(nextDueDate);
  if (d < 0) return 'overdue';
  if (d <= 7) return 'soon';
  return 'upcoming';
}

function projectGoalDate(goal: BudgetGoal): string | null {
  if (goal.isCompleted || goal.currentAmount <= 0 || goal.contributions.length === 0) return null;
  const sorted = [...goal.contributions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const firstDate = new Date(sorted[sorted.length - 1].date);
  const now = new Date();
  const daysActive = Math.max(1, (now.getTime() - firstDate.getTime()) / 86_400_000);
  const dailyRate = goal.currentAmount / daysActive;
  if (dailyRate <= 0) return null;
  const daysLeft = (goal.targetAmount - goal.currentAmount) / dailyRate;
  return format(new Date(now.getTime() + daysLeft * 86_400_000), 'MM/yyyy');
}

function deadlineAlert(goal: BudgetGoal): boolean {
  if (!goal.deadline || goal.isCompleted) return false;
  const daysLeft = (new Date(goal.deadline).getTime() - Date.now()) / 86_400_000;
  return daysLeft >= 0 && daysLeft <= 30;
}

// ─── Empty initial forms ──────────────────────────────────────────────────────

const emptyExpenseForm = () => ({
  amount: '', category: 'groceries', description: '',
  date: toLocalDate(new Date()), isRecurring: false,
});
const emptyGoalForm = () => ({
  name: '', targetAmount: '', currency: 'EUR', deadline: '', icon: '',
});
const emptyEnvelopeForm = (): {
  name: string; budgetedAmount: string; currency: string;
  period: 'monthly' | 'weekly' | 'yearly'; category: string; color: string; icon: string;
} => ({
  name: '', budgetedAmount: '', currency: 'EUR',
  period: 'monthly', category: '', color: '#3b82f6', icon: '',
});
const emptyContributeForm = () => ({ amount: '', note: '' });
const emptyRecurringForm = (): {
  name: string; amount: string; category: string; description: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'; startDate: string;
} => ({
  name: '', amount: '', category: 'subscriptions', description: '',
  frequency: 'monthly', startDate: toLocalDate(new Date()),
});
const emptyIncomeForm = () => ({
  amount: '', category: 'salary', description: '',
  date: toLocalDate(new Date()), isRecurring: false,
});

// ─── Component ───────────────────────────────────────────────────────────────

export function BudgetPage() {
  const { activeFamily } = useFamilyStore();
  const familyId = activeFamily?._id;

  const [tab, setTab] = useState<'overview' | 'expenses' | 'incomes' | 'envelopes' | 'goals' | 'recurring'>('overview');

  // Data
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [totalIncomes, setTotalIncomes] = useState(0);
  const [goals, setGoals] = useState<BudgetGoal[]>([]);
  const [envelopes, setEnvelopes] = useState<BudgetEnvelope[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);

  // Shared period filter (expenses + incomes tabs)
  const [period, setPeriod] = useState<Date>(startOfMonth(new Date()));
  const [search, setSearch] = useState('');

  // Expense modal
  const [expenseModal, setExpenseModal] = useState<{ mode: 'create' | 'edit'; data?: Expense } | null>(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm());

  // Income modal
  const [incomeModal, setIncomeModal] = useState<{ mode: 'create' | 'edit'; data?: Income } | null>(null);
  const [incomeForm, setIncomeForm] = useState(emptyIncomeForm());

  // Goal modal
  const [goalModal, setGoalModal] = useState<{ mode: 'create' | 'edit'; data?: BudgetGoal } | null>(null);
  const [goalForm, setGoalForm] = useState(emptyGoalForm());

  // Contribute modal
  const [contributeGoal, setContributeGoal] = useState<BudgetGoal | null>(null);
  const [contributeForm, setContributeForm] = useState(emptyContributeForm());

  // Envelope modal
  const [envelopeModal, setEnvelopeModal] = useState<{ mode: 'create' | 'edit'; data?: BudgetEnvelope } | null>(null);
  const [envelopeForm, setEnvelopeForm] = useState(emptyEnvelopeForm());

  // Recurring modal
  const [recurringModal, setRecurringModal] = useState<{ mode: 'create' | 'edit'; data?: RecurringExpense } | null>(null);
  const [recurringForm, setRecurringForm] = useState(emptyRecurringForm());
  const [payingId, setPayingId] = useState<string | null>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'expense' | 'income' | 'goal' | 'envelope' | 'recurring'; id: string;
  } | null>(null);

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchSummary = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data } = await api.get(`/families/${familyId}/budget/summary`);
      setSummary(data);
    } catch { /* silent */ }
  }, [familyId]);

  const fetchExpenses = useCallback(async () => {
    if (!familyId) return;
    try {
      const start = format(startOfMonth(period), 'yyyy-MM-dd');
      const end   = format(endOfMonth(period),   'yyyy-MM-dd');
      const params: Record<string, string> = { startDate: start, endDate: end, limit: '200' };
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get(`/families/${familyId}/budget/expenses`, { params });
      setExpenses(data.expenses);
      setTotalExpenses(data.total);
    } catch { /* silent */ }
  }, [familyId, period, search]);

  const fetchIncomes = useCallback(async () => {
    if (!familyId) return;
    try {
      const start = format(startOfMonth(period), 'yyyy-MM-dd');
      const end   = format(endOfMonth(period),   'yyyy-MM-dd');
      const { data } = await api.get(`/families/${familyId}/budget/incomes`, {
        params: { startDate: start, endDate: end, limit: '200' },
      });
      setIncomes(data.incomes);
      setTotalIncomes(data.total);
    } catch { /* silent */ }
  }, [familyId, period]);

  const fetchGoals = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data } = await api.get(`/families/${familyId}/budget/goals`);
      setGoals(data.goals);
    } catch { /* silent */ }
  }, [familyId]);

  const fetchEnvelopes = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data } = await api.get(`/families/${familyId}/budget/envelopes`);
      setEnvelopes(data.envelopes);
    } catch { /* silent */ }
  }, [familyId]);

  const fetchRecurring = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data } = await api.get(`/families/${familyId}/budget/recurring`);
      setRecurring(data.recurring);
    } catch { /* silent */ }
  }, [familyId]);

  useEffect(() => {
    fetchSummary();
    fetchGoals();
    fetchEnvelopes();
    fetchRecurring();
  }, [fetchSummary, fetchGoals, fetchEnvelopes, fetchRecurring]);

  useEffect(() => {
    fetchExpenses();
    fetchIncomes();
  }, [fetchExpenses, fetchIncomes]);

  // ── Chart data ─────────────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const item = summary?.monthlyTrend.find((m) => m.month === key);
      return {
        label:    MONTH_NAMES[d.getMonth()],
        expenses: item?.expenses ?? 0,
        income:   item?.income   ?? 0,
      };
    });
  }, [summary]);

  const lastMonthExpenses = useMemo(() => {
    const now = new Date();
    const last = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
    const adjusted = last === `${now.getFullYear()}-00`
      ? `${now.getFullYear() - 1}-12`
      : last;
    return summary?.monthlyTrend.find((m) => m.month === adjusted)?.expenses ?? null;
  }, [summary]);

  // ── Expense CRUD ──────────────────────────────────────────────────────────

  const openCreateExpense = () => {
    setExpenseForm(emptyExpenseForm());
    setExpenseModal({ mode: 'create' });
  };
  const openEditExpense = (exp: Expense) => {
    setExpenseForm({
      amount: String(exp.amount), category: exp.category,
      description: exp.description, date: toLocalDate(new Date(exp.date)),
      isRecurring: exp.isRecurring,
    });
    setExpenseModal({ mode: 'edit', data: exp });
  };
  const saveExpense = async () => {
    if (!familyId || !expenseForm.amount || !expenseForm.description) return;
    const payload = { ...expenseForm, amount: parseFloat(expenseForm.amount), date: new Date(expenseForm.date).toISOString() };
    try {
      if (expenseModal?.mode === 'edit' && expenseModal.data) {
        await api.patch(`/families/${familyId}/budget/expenses/${expenseModal.data._id}`, payload);
        toast.success('Dépense modifiée');
      } else {
        await api.post(`/families/${familyId}/budget/expenses`, payload);
        toast.success('Dépense ajoutée');
      }
      setExpenseModal(null);
      fetchExpenses();
      fetchSummary();
    } catch { toast.error('Erreur lors de la sauvegarde'); }
  };
  const confirmDeleteExpense = async (id: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/budget/expenses/${id}`);
      toast.success('Dépense supprimée');
      setDeleteConfirm(null);
      fetchExpenses();
      fetchSummary();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  // ── Income CRUD ───────────────────────────────────────────────────────────

  const openCreateIncome = () => {
    setIncomeForm(emptyIncomeForm());
    setIncomeModal({ mode: 'create' });
  };
  const openEditIncome = (inc: Income) => {
    setIncomeForm({
      amount: String(inc.amount), category: inc.category,
      description: inc.description ?? '', date: toLocalDate(new Date(inc.date)),
      isRecurring: inc.isRecurring,
    });
    setIncomeModal({ mode: 'edit', data: inc });
  };
  const saveIncome = async () => {
    if (!familyId || !incomeForm.amount || !incomeForm.description) return;
    const payload = { ...incomeForm, amount: parseFloat(incomeForm.amount), date: new Date(incomeForm.date).toISOString() };
    try {
      if (incomeModal?.mode === 'edit' && incomeModal.data) {
        await api.patch(`/families/${familyId}/budget/incomes/${incomeModal.data._id}`, payload);
        toast.success('Revenu modifié');
      } else {
        await api.post(`/families/${familyId}/budget/incomes`, payload);
        toast.success('Revenu ajouté');
      }
      setIncomeModal(null);
      fetchIncomes();
      fetchSummary();
    } catch { toast.error('Erreur lors de la sauvegarde'); }
  };
  const confirmDeleteIncome = async (id: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/budget/incomes/${id}`);
      toast.success('Revenu supprimé');
      setDeleteConfirm(null);
      fetchIncomes();
      fetchSummary();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  // ── Goal CRUD ────────────────────────────────────────────────────────────

  const openCreateGoal = () => { setGoalForm(emptyGoalForm()); setGoalModal({ mode: 'create' }); };
  const openEditGoal = (goal: BudgetGoal) => {
    setGoalForm({
      name: goal.name, targetAmount: String(goal.targetAmount), currency: goal.currency,
      deadline: goal.deadline ? toLocalDate(new Date(goal.deadline)) : '', icon: goal.icon ?? '',
    });
    setGoalModal({ mode: 'edit', data: goal });
  };
  const saveGoal = async () => {
    if (!familyId || !goalForm.name || !goalForm.targetAmount) return;
    const payload = {
      name: goalForm.name, targetAmount: parseFloat(goalForm.targetAmount),
      currency: goalForm.currency, deadline: goalForm.deadline || null,
      icon: goalForm.icon || null,
    };
    try {
      if (goalModal?.mode === 'edit' && goalModal.data) {
        await api.patch(`/families/${familyId}/budget/goals/${goalModal.data._id}`, payload);
        toast.success('Objectif modifié');
      } else {
        await api.post(`/families/${familyId}/budget/goals`, payload);
        toast.success('Objectif créé');
      }
      setGoalModal(null);
      fetchGoals();
    } catch { toast.error('Erreur lors de la sauvegarde'); }
  };
  const openContribute = (goal: BudgetGoal) => { setContributeForm(emptyContributeForm()); setContributeGoal(goal); };
  const saveContribution = async () => {
    if (!familyId || !contributeGoal || !contributeForm.amount) return;
    try {
      await api.post(`/families/${familyId}/budget/goals/${contributeGoal._id}/contribute`, {
        amount: parseFloat(contributeForm.amount), note: contributeForm.note || undefined,
      });
      toast.success('Contribution ajoutée !');
      setContributeGoal(null);
      fetchGoals();
    } catch { toast.error("Erreur lors de l'ajout"); }
  };
  const confirmDeleteGoal = async (id: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/budget/goals/${id}`);
      toast.success('Objectif supprimé');
      setDeleteConfirm(null);
      fetchGoals();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  // ── Envelope CRUD ────────────────────────────────────────────────────────

  const openCreateEnvelope = () => { setEnvelopeForm(emptyEnvelopeForm()); setEnvelopeModal({ mode: 'create' }); };
  const openEditEnvelope = (env: BudgetEnvelope) => {
    setEnvelopeForm({
      name: env.name, budgetedAmount: String(env.budgetedAmount), currency: env.currency,
      period: env.period, category: env.category ?? '', color: env.color, icon: env.icon ?? '',
    });
    setEnvelopeModal({ mode: 'edit', data: env });
  };
  const saveEnvelope = async () => {
    if (!familyId || !envelopeForm.name || !envelopeForm.budgetedAmount) return;
    const payload = {
      name: envelopeForm.name, budgetedAmount: parseFloat(envelopeForm.budgetedAmount),
      currency: envelopeForm.currency, period: envelopeForm.period,
      category: envelopeForm.category || null, color: envelopeForm.color,
      icon: envelopeForm.icon || null,
    };
    try {
      if (envelopeModal?.mode === 'edit' && envelopeModal.data) {
        await api.patch(`/families/${familyId}/budget/envelopes/${envelopeModal.data._id}`, payload);
        toast.success('Enveloppe modifiée');
      } else {
        await api.post(`/families/${familyId}/budget/envelopes`, payload);
        toast.success('Enveloppe créée');
      }
      setEnvelopeModal(null);
      fetchEnvelopes();
    } catch { toast.error('Erreur lors de la sauvegarde'); }
  };
  const confirmDeleteEnvelope = async (id: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/budget/envelopes/${id}`);
      toast.success('Enveloppe supprimée');
      setDeleteConfirm(null);
      fetchEnvelopes();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  // ── Recurring CRUD ───────────────────────────────────────────────────────

  const openCreateRecurring = () => { setRecurringForm(emptyRecurringForm()); setRecurringModal({ mode: 'create' }); };
  const openEditRecurring = (r: RecurringExpense) => {
    setRecurringForm({
      name: r.name, amount: String(r.amount), category: r.category,
      description: r.description ?? '', frequency: r.frequency,
      startDate: toLocalDate(new Date(r.startDate)),
    });
    setRecurringModal({ mode: 'edit', data: r });
  };
  const saveRecurring = async () => {
    if (!familyId || !recurringForm.name || !recurringForm.amount) return;
    const payload = {
      name: recurringForm.name, amount: parseFloat(recurringForm.amount),
      category: recurringForm.category, description: recurringForm.description || null,
      frequency: recurringForm.frequency, startDate: new Date(recurringForm.startDate).toISOString(),
    };
    try {
      if (recurringModal?.mode === 'edit' && recurringModal.data) {
        await api.patch(`/families/${familyId}/budget/recurring/${recurringModal.data._id}`, payload);
        toast.success('Dépense récurrente modifiée');
      } else {
        await api.post(`/families/${familyId}/budget/recurring`, payload);
        toast.success('Dépense récurrente créée');
      }
      setRecurringModal(null);
      fetchRecurring();
    } catch { toast.error('Erreur lors de la sauvegarde'); }
  };
  const payRecurring = async (r: RecurringExpense) => {
    if (!familyId) return;
    setPayingId(r._id);
    try {
      await api.post(`/families/${familyId}/budget/recurring/${r._id}/pay`);
      toast.success(`"${r.name}" marqué comme payé`);
      fetchRecurring();
      fetchExpenses();
      fetchSummary();
    } catch { toast.error('Erreur lors du paiement'); }
    finally { setPayingId(null); }
  };
  const confirmDeleteRecurring = async (id: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/budget/recurring/${id}`);
      toast.success('Dépense récurrente supprimée');
      setDeleteConfirm(null);
      fetchRecurring();
    } catch { toast.error('Erreur lors de la suppression'); }
  };

  // ── Delete dispatch ──────────────────────────────────────────────────────

  const handleDeleteConfirm = () => {
    if (!deleteConfirm) return;
    if      (deleteConfirm.type === 'expense')   confirmDeleteExpense(deleteConfirm.id);
    else if (deleteConfirm.type === 'income')    confirmDeleteIncome(deleteConfirm.id);
    else if (deleteConfirm.type === 'goal')      confirmDeleteGoal(deleteConfirm.id);
    else if (deleteConfirm.type === 'envelope')  confirmDeleteEnvelope(deleteConfirm.id);
    else if (deleteConfirm.type === 'recurring') confirmDeleteRecurring(deleteConfirm.id);
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!familyId) {
    return (
      <EmptyState
        icon={<Wallet className="w-12 h-12" />}
        title="Aucune famille active"
        description="Sélectionnez ou créez une famille pour accéder au budget."
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const tabs = [
    { key: 'overview',  label: "Vue d'ensemble", icon: TrendingUp },
    { key: 'expenses',  label: 'Dépenses',        icon: Wallet     },
    { key: 'incomes',   label: 'Revenus',          icon: Banknote   },
    { key: 'envelopes', label: 'Enveloppes',       icon: Package    },
    { key: 'goals',     label: 'Objectifs',        icon: Target     },
    { key: 'recurring', label: 'Récurrents',       icon: Repeat     },
  ] as const;

  // Shared period navigator (reused for expenses + incomes tabs)
  const PeriodNav = () => (
    <div className="flex items-center justify-between">
      <button
        onClick={() => setPeriod((p) => subMonths(p, 1))}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm capitalize">
          {format(period, 'MMMM yyyy')}
        </span>
        {format(period, 'yyyy-MM') !== format(new Date(), 'yyyy-MM') && (
          <button
            onClick={() => setPeriod(startOfMonth(new Date()))}
            className="text-xs text-budget underline"
          >
            Aujourd'hui
          </button>
        )}
      </div>
      <button
        onClick={() => setPeriod((p) => addMonths(p, 1))}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Budget</h2>
        {tab === 'expenses' && (
          <Button size="sm" onClick={openCreateExpense}>
            <Plus className="w-4 h-4 mr-1" /> Dépense
          </Button>
        )}
        {tab === 'incomes' && (
          <Button size="sm" onClick={openCreateIncome} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Revenu
          </Button>
        )}
        {tab === 'envelopes' && (
          <Button size="sm" onClick={openCreateEnvelope}>
            <Plus className="w-4 h-4 mr-1" /> Enveloppe
          </Button>
        )}
        {tab === 'goals' && (
          <Button size="sm" onClick={openCreateGoal}>
            <Plus className="w-4 h-4 mr-1" /> Objectif
          </Button>
        )}
        {tab === 'recurring' && (
          <Button size="sm" onClick={openCreateRecurring}>
            <Plus className="w-4 h-4 mr-1" /> Récurrent
          </Button>
        )}
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex-shrink-0 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium transition-colors',
              tab === key
                ? 'bg-white dark:bg-gray-700 text-budget shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TAB: Vue d'ensemble
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-5">

          {/* Balance card — prominent */}
          <div className={clsx(
            'card p-5 text-center border-2',
            (summary?.balance ?? 0) >= 0
              ? 'border-green-200 dark:border-green-800'
              : 'border-red-200 dark:border-red-800',
          )}>
            <p className="text-xs text-gray-500 mb-1">Solde du mois</p>
            <p className={clsx(
              'text-3xl font-extrabold',
              (summary?.balance ?? 0) >= 0 ? 'text-green-600' : 'text-red-500',
            )}>
              {summary
                ? `${summary.balance >= 0 ? '+' : ''}${summary.balance.toFixed(2)} €`
                : '—'}
            </p>
            {summary && summary.totalIncome > 0 && (
              <p className={clsx(
                'text-sm mt-1 font-medium',
                summary.savingsRate >= 0 ? 'text-green-500' : 'text-red-400',
              )}>
                Taux d'épargne : {summary.savingsRate.toFixed(1)} %
              </p>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4">
              <p className="text-xs text-gray-500 mb-1">Dépenses</p>
              <p className="text-xl font-bold text-red-500">
                {summary?.totalSpent.toFixed(2) ?? '—'} €
              </p>
              {lastMonthExpenses != null && summary?.totalSpent != null && (
                <div className="flex items-center gap-1 mt-0.5">
                  {summary.totalSpent > lastMonthExpenses
                    ? <TrendingUp className="w-3.5 h-3.5 text-red-400" />
                    : <TrendingDown className="w-3.5 h-3.5 text-green-400" />}
                  <span className="text-xs text-gray-400">
                    {lastMonthExpenses.toFixed(0)} € le mois passé
                  </span>
                </div>
              )}
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 mb-1">Revenus</p>
              <p className="text-xl font-bold text-green-600">
                {summary?.totalIncome.toFixed(2) ?? '—'} €
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 mb-1">Enveloppes</p>
              <p className="text-xl font-bold">{envelopes.length}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 mb-1">Objectifs actifs</p>
              <p className="text-xl font-bold">{goals.filter((g) => !g.isCompleted).length}</p>
            </div>
          </div>

          {/* Grouped bar chart — expenses vs income */}
          <div className="card p-4">
            <h3 className="font-semibold text-sm mb-4">Revenus vs Dépenses (12 mois)</h3>
            {chartData.some((d) => d.expenses > 0 || d.income > 0) ? (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}€`} />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      `${v.toFixed(2)} €`,
                      name === 'expenses' ? 'Dépenses' : 'Revenus',
                    ]}
                    cursor={{ fill: 'rgba(139,92,246,0.06)' }}
                  />
                  <Legend
                    formatter={(name) => name === 'expenses' ? 'Dépenses' : 'Revenus'}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="income"   fill="#22c55e" radius={[3, 3, 0, 0]} name="income" />
                  <Bar dataKey="expenses" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="expenses" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Aucune donnée enregistrée</p>
            )}
          </div>

          {/* Category breakdown */}
          {summary && summary.byCategory.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-sm mb-4">Répartition des dépenses ce mois</h3>
              <div className="space-y-2.5">
                {summary.byCategory.slice(0, 8).map((cat) => (
                  <div key={cat.category} className="flex items-center gap-3">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[cat.category] ?? '#6b7280' }}
                    />
                    <span className="text-sm flex-1 min-w-0 truncate">
                      {CATEGORY_LABELS[cat.category] ?? cat.category}
                    </span>
                    <span className="text-sm font-medium whitespace-nowrap">{cat.total.toFixed(2)} €</span>
                    <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-2 flex-shrink-0">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${(cat.total / summary.totalSpent) * 100}%`,
                          backgroundColor: CATEGORY_COLORS[cat.category] ?? '#6b7280',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={openCreateExpense} variant="secondary">
              <Plus className="w-4 h-4 mr-2" /> Dépense
            </Button>
            <Button onClick={openCreateIncome} className="bg-green-600 hover:bg-green-700 text-white">
              <Plus className="w-4 h-4 mr-2" /> Revenu
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: Dépenses
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          <PeriodNav />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9 text-sm"
            />
          </div>

          {expenses.length > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-500 px-1">
              <span>{totalExpenses} dépense{totalExpenses > 1 ? 's' : ''}</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                Total : {expenses.reduce((s, e) => s + e.amount, 0).toFixed(2)} €
              </span>
            </div>
          )}

          <div className="card divide-y divide-gray-100 dark:divide-gray-700">
            {expenses.length === 0 ? (
              <EmptyState
                icon={<Wallet className="w-10 h-10" />}
                title="Aucune dépense"
                description="Ajoutez votre première dépense"
              />
            ) : (
              expenses.map((exp) => (
                <div key={exp._id} className="flex items-center gap-3 px-4 py-3 group">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[exp.category] ?? '#6b7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{exp.description}</p>
                    <p className="text-xs text-gray-400">
                      {CATEGORY_LABELS[exp.category] ?? exp.category} · {format(new Date(exp.date), 'dd/MM/yyyy')}
                    </p>
                  </div>
                  {exp.isRecurring && (
                    <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 px-2 py-0.5 rounded-full">
                      Récurrent
                    </span>
                  )}
                  <span className="font-semibold text-sm whitespace-nowrap">{exp.amount.toFixed(2)} €</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditExpense(exp)} className="p-1 text-gray-400 hover:text-budget">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ type: 'expense', id: exp._id })}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: Revenus
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'incomes' && (
        <div className="space-y-4">
          <PeriodNav />

          {/* Period summary */}
          {incomes.length > 0 && (
            <div className="card p-4 flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {totalIncomes} entrée{totalIncomes > 1 ? 's' : ''} ce mois
                </p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  +{incomes.reduce((s, i) => s + i.amount, 0).toFixed(2)} €
                </p>
              </div>
              {summary && summary.totalSpent > 0 && summary.totalIncome > 0 && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Solde</p>
                  <p className={clsx(
                    'text-lg font-bold',
                    summary.balance >= 0 ? 'text-green-600' : 'text-red-500',
                  )}>
                    {summary.balance >= 0 ? '+' : ''}{summary.balance.toFixed(2)} €
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="card divide-y divide-gray-100 dark:divide-gray-700">
            {incomes.length === 0 ? (
              <EmptyState
                icon={<Banknote className="w-10 h-10" />}
                title="Aucun revenu ce mois"
                description="Enregistrez vos salaires, freelance, loyers perçus…"
                action={<Button size="sm" onClick={openCreateIncome} className="bg-green-600 hover:bg-green-700 text-white">Ajouter un revenu</Button>}
              />
            ) : (
              incomes.map((inc) => (
                <div key={inc._id} className="flex items-center gap-3 px-4 py-3 group">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: INCOME_COLORS[inc.category] ?? '#6b7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inc.description ?? inc.category}</p>
                    <p className="text-xs text-gray-400">
                      {INCOME_CATEGORY_LABELS[inc.category as keyof typeof INCOME_CATEGORY_LABELS] ?? inc.category}
                      {' · '}
                      {format(new Date(inc.date), 'dd/MM/yyyy')}
                    </p>
                  </div>
                  {inc.isRecurring && (
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 px-2 py-0.5 rounded-full">
                      Récurrent
                    </span>
                  )}
                  <span className="font-semibold text-sm text-green-600 whitespace-nowrap">
                    +{inc.amount.toFixed(2)} €
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditIncome(inc)} className="p-1 text-gray-400 hover:text-budget">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ type: 'income', id: inc._id })}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: Enveloppes
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'envelopes' && (
        <div>
          {envelopes.length === 0 ? (
            <EmptyState
              icon={<Package className="w-12 h-12" />}
              title="Aucune enveloppe"
              description="Créez des enveloppes budgétaires pour suivre vos catégories de dépenses"
              action={<Button size="sm" onClick={openCreateEnvelope}>Créer une enveloppe</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {envelopes.map((env) => {
                const pct = env.budgetedAmount > 0 ? env.spentAmount / env.budgetedAmount : 0;
                const remaining = env.budgetedAmount - env.spentAmount;
                return (
                  <div key={env._id} className="card p-4 relative group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {env.icon && <span className="text-xl">{env.icon}</span>}
                        <div>
                          <h3 className="font-semibold text-sm">{env.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {env.category && (
                              <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                {CATEGORY_LABELS[env.category] ?? env.category}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">{PERIOD_LABELS[env.period]}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditEnvelope(env)} className="p-1 text-gray-400 hover:text-budget">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'envelope', id: env._id })}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className={envelopeColor(env.spentAmount, env.budgetedAmount)}>
                          {env.spentAmount.toFixed(2)} € dépensés
                        </span>
                        <span className="text-gray-400">{env.budgetedAmount.toFixed(2)} €</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
                        <div
                          className={clsx('h-2.5 rounded-full transition-all', envelopeBg(env.spentAmount, env.budgetedAmount))}
                          style={{ width: `${Math.min(pct * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={clsx('font-medium', remaining < 0 ? 'text-red-500' : 'text-gray-500')}>
                        {remaining < 0 ? `Dépassement : ${Math.abs(remaining).toFixed(2)} €` : `Restant : ${remaining.toFixed(2)} €`}
                      </span>
                      <span className={clsx('font-semibold', envelopeColor(env.spentAmount, env.budgetedAmount))}>
                        {Math.round(pct * 100)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: Objectifs
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'goals' && (
        <div>
          {goals.length === 0 ? (
            <EmptyState
              icon={<PiggyBank className="w-12 h-12" />}
              title="Aucun objectif"
              description="Créez un objectif d'épargne et suivez votre progression"
              action={<Button size="sm" onClick={openCreateGoal}>Créer un objectif</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {goals.map((goal) => {
                const pct = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
                const projection = projectGoalDate(goal);
                const alert = deadlineAlert(goal);
                return (
                  <div key={goal._id} className={clsx('card p-4 relative group', goal.isCompleted && 'opacity-75')}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {goal.icon ? (
                          <span className="text-2xl">{goal.icon}</span>
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-budget/10 flex items-center justify-center">
                            <PiggyBank className="w-5 h-5 text-budget" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-sm flex items-center gap-1.5">
                            {goal.name}
                            {goal.isCompleted && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                            {alert && !goal.isCompleted && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                          </h3>
                          {goal.deadline && (
                            <p className={clsx('text-xs flex items-center gap-0.5', alert ? 'text-orange-500' : 'text-gray-400')}>
                              <Calendar className="w-3 h-3" />
                              {format(new Date(goal.deadline), 'dd/MM/yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditGoal(goal)} className="p-1 text-gray-400 hover:text-budget">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'goal', id: goal._id })}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mb-2">
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3">
                        <div
                          className={clsx('h-3 rounded-full transition-all', goal.isCompleted ? 'bg-green-500' : 'bg-budget')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm mb-3">
                      <span className="text-gray-500">
                        {goal.currentAmount.toFixed(2)} / {goal.targetAmount.toFixed(2)} {goal.currency}
                      </span>
                      <span className={clsx('font-bold', goal.isCompleted ? 'text-green-500' : 'text-budget')}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                    {projection && !goal.isCompleted && (
                      <p className="text-xs text-gray-400 mb-3">
                        À ce rythme, atteint en <span className="font-medium text-gray-600">{projection}</span>
                      </p>
                    )}
                    {goal.contributions.length > 0 && (
                      <p className="text-xs text-gray-400 mb-3">
                        {goal.contributions.length} contribution{goal.contributions.length > 1 ? 's' : ''}
                      </p>
                    )}
                    {!goal.isCompleted && (
                      <Button size="sm" variant="secondary" onClick={() => openContribute(goal)} className="w-full">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Contribuer
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: Récurrents
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'recurring' && (() => {
        const activeRecurring = recurring.filter((r) => r.isActive);
        const inactive = recurring.filter((r) => !r.isActive);
        const monthlyTotal = activeRecurring.reduce(
          (sum, r) => sum + r.amount * (RECURRING_MONTHLY_FACTOR[r.frequency] ?? 1),
          0,
        );
        const overdue  = activeRecurring.filter((r) => recurringStatus(r.nextDueDate) === 'overdue');
        const soon     = activeRecurring.filter((r) => recurringStatus(r.nextDueDate) === 'soon');
        const upcoming = activeRecurring.filter((r) => recurringStatus(r.nextDueDate) === 'upcoming');

        const RecurringCard = ({ r }: { r: RecurringExpense }) => {
          const days = daysUntilDue(r.nextDueDate);
          const status = recurringStatus(r.nextDueDate);
          return (
            <div className={clsx('card p-4 relative group', !r.isActive && 'opacity-50')}>
              <div className="flex items-start gap-3">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                  style={{ backgroundColor: CATEGORY_COLORS[r.category] ?? '#6b7280' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{r.name}</p>
                    <span className="font-bold text-sm whitespace-nowrap">{r.amount.toFixed(2)} €</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-gray-400">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {RECURRING_FREQUENCY_LABELS[r.frequency]}
                    </span>
                    {r.isActive && (
                      <span className={clsx(
                        'text-xs font-medium px-1.5 py-0.5 rounded-full',
                        status === 'overdue'  && 'bg-red-100 text-red-600 dark:bg-red-900/30',
                        status === 'soon'     && 'bg-orange-100 text-orange-600 dark:bg-orange-900/30',
                        status === 'upcoming' && 'bg-green-100 text-green-600 dark:bg-green-900/30',
                      )}>
                        {status === 'overdue' ? `En retard de ${Math.abs(days)}j`
                          : days === 0 ? "Aujourd'hui"
                          : `J-${days}`}
                      </span>
                    )}
                  </div>
                  {r.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.description}</p>}
                  {r.lastPaidAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Dernier paiement : {format(new Date(r.lastPaidAt), 'dd/MM/yyyy')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                {r.isActive && (
                  <Button size="sm" onClick={() => payRecurring(r)} isLoading={payingId === r._id} className="flex-1">
                    Payer maintenant
                  </Button>
                )}
                <div className="flex gap-1 ml-auto">
                  <button onClick={() => openEditRecurring(r)} className="p-1.5 text-gray-400 hover:text-budget rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ type: 'recurring', id: r._id })}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        };

        return (
          <div className="space-y-6">
            {activeRecurring.length > 0 && (
              <div className="card p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Équivalent mensuel total</p>
                  <p className="text-2xl font-bold">{monthlyTotal.toFixed(2)} €</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">{activeRecurring.length} actif{activeRecurring.length > 1 ? 's' : ''}</p>
                  {overdue.length > 0 && (
                    <p className="text-xs text-red-500 font-medium">{overdue.length} en retard</p>
                  )}
                </div>
              </div>
            )}

            {activeRecurring.length === 0 && inactive.length === 0 ? (
              <EmptyState
                icon={<Repeat className="w-12 h-12" />}
                title="Aucune dépense récurrente"
                description="Ajoutez loyer, abonnements, assurances... et payez-les en un clic chaque période."
                action={<Button size="sm" onClick={openCreateRecurring}>Ajouter</Button>}
              />
            ) : (
              <>
                {overdue.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-red-500 mb-3 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> En retard ({overdue.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {overdue.map((r) => <RecurringCard key={r._id} r={r} />)}
                    </div>
                  </div>
                )}
                {soon.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-orange-500 mb-3">Cette semaine ({soon.length})</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {soon.map((r) => <RecurringCard key={r._id} r={r} />)}
                    </div>
                  </div>
                )}
                {upcoming.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-3">À venir ({upcoming.length})</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {upcoming.map((r) => <RecurringCard key={r._id} r={r} />)}
                    </div>
                  </div>
                )}
                {inactive.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-400 mb-3">Désactivés ({inactive.length})</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {inactive.map((r) => <RecurringCard key={r._id} r={r} />)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════ */}

      {/* Expense modal */}
      <Modal
        isOpen={!!expenseModal}
        onClose={() => setExpenseModal(null)}
        title={expenseModal?.mode === 'edit' ? 'Modifier la dépense' : 'Nouvelle dépense'}
      >
        <div className="space-y-4">
          <Input
            label="Montant (€)" type="number" step="0.01" min="0"
            value={expenseForm.amount}
            onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
            required
          />
          <div>
            <label className="block text-sm font-medium mb-1">Catégorie</label>
            <select
              value={expenseForm.category}
              onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}
              className="input-field"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
              ))}
            </select>
          </div>
          <Input
            label="Description"
            value={expenseForm.description}
            onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
            required
          />
          <Input
            label="Date" type="date"
            value={expenseForm.date}
            onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={expenseForm.isRecurring}
              onChange={(e) => setExpenseForm((f) => ({ ...f, isRecurring: e.target.checked }))}
              className="rounded"
            />
            Dépense récurrente
          </label>
          <Button onClick={saveExpense} className="w-full" disabled={!expenseForm.amount || !expenseForm.description}>
            {expenseModal?.mode === 'edit' ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </Modal>

      {/* Income modal */}
      <Modal
        isOpen={!!incomeModal}
        onClose={() => setIncomeModal(null)}
        title={incomeModal?.mode === 'edit' ? 'Modifier le revenu' : 'Nouveau revenu'}
      >
        <div className="space-y-4">
          <Input
            label="Montant (€)" type="number" step="0.01" min="0"
            value={incomeForm.amount}
            onChange={(e) => setIncomeForm((f) => ({ ...f, amount: e.target.value }))}
            required
          />
          <div>
            <label className="block text-sm font-medium mb-1">Catégorie</label>
            <select
              value={incomeForm.category}
              onChange={(e) => setIncomeForm((f) => ({ ...f, category: e.target.value }))}
              className="input-field"
            >
              {INCOME_CATEGORIES.map((c) => (
                <option key={c} value={c}>{INCOME_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <Input
            label="Description"
            value={incomeForm.description}
            onChange={(e) => setIncomeForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Salaire mai, Mission freelance ABC…"
            required
          />
          <Input
            label="Date" type="date"
            value={incomeForm.date}
            onChange={(e) => setIncomeForm((f) => ({ ...f, date: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={incomeForm.isRecurring}
              onChange={(e) => setIncomeForm((f) => ({ ...f, isRecurring: e.target.checked }))}
              className="rounded"
            />
            Revenu récurrent (salaire mensuel, etc.)
          </label>
          <Button
            onClick={saveIncome}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            disabled={!incomeForm.amount || !incomeForm.description}
          >
            {incomeModal?.mode === 'edit' ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </Modal>

      {/* Envelope modal */}
      <Modal
        isOpen={!!envelopeModal}
        onClose={() => setEnvelopeModal(null)}
        title={envelopeModal?.mode === 'edit' ? "Modifier l'enveloppe" : 'Nouvelle enveloppe'}
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                label="Nom"
                value={envelopeForm.name}
                onChange={(e) => setEnvelopeForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="w-24">
              <Input
                label="Icône"
                value={envelopeForm.icon}
                onChange={(e) => setEnvelopeForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="🏠"
              />
            </div>
          </div>
          <Input
            label="Budget (€)" type="number" step="0.01" min="0"
            value={envelopeForm.budgetedAmount}
            onChange={(e) => setEnvelopeForm((f) => ({ ...f, budgetedAmount: e.target.value }))}
            required
          />
          <div>
            <label className="block text-sm font-medium mb-1">Période</label>
            <div className="flex gap-2">
              {(['monthly', 'weekly', 'yearly'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setEnvelopeForm((f) => ({ ...f, period: p }))}
                  className={clsx(
                    'flex-1 py-2 rounded-lg border text-sm transition-colors',
                    envelopeForm.period === p
                      ? 'border-budget bg-budget/10 text-budget font-medium'
                      : 'border-gray-200 dark:border-gray-700',
                  )}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Catégorie liée (optionnel)</label>
            <select
              value={envelopeForm.category}
              onChange={(e) => setEnvelopeForm((f) => ({ ...f, category: e.target.value }))}
              className="input-field"
            >
              <option value="">— Aucune —</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Couleur</label>
            <div className="flex gap-2 flex-wrap">
              {ENVELOPE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setEnvelopeForm((f) => ({ ...f, color: c }))}
                  className={clsx(
                    'w-8 h-8 rounded-full transition-transform',
                    envelopeForm.color === c && 'ring-2 ring-offset-2 ring-gray-400 scale-110',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Button
            onClick={saveEnvelope} className="w-full"
            disabled={!envelopeForm.name || !envelopeForm.budgetedAmount}
          >
            {envelopeModal?.mode === 'edit' ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </Modal>

      {/* Goal modal */}
      <Modal
        isOpen={!!goalModal}
        onClose={() => setGoalModal(null)}
        title={goalModal?.mode === 'edit' ? "Modifier l'objectif" : 'Nouvel objectif'}
      >
        <div className="space-y-4">
          <Input
            label="Nom"
            value={goalForm.name}
            onChange={(e) => setGoalForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <div>
            <label className="block text-sm font-medium mb-2">
              Icône
              {goalForm.icon && (
                <button
                  onClick={() => setGoalForm((f) => ({ ...f, icon: '' }))}
                  className="ml-2 text-xs text-gray-400 hover:text-red-500 font-normal"
                >
                  Retirer
                </button>
              )}
            </label>
            <div className="grid grid-cols-8 gap-1.5">
              {GOAL_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setGoalForm((f) => ({ ...f, icon: f.icon === emoji ? '' : emoji }))}
                  className={clsx(
                    'text-xl p-1.5 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700',
                    goalForm.icon === emoji ? 'bg-budget/15 ring-2 ring-budget ring-offset-1' : '',
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {goalForm.icon && (
              <p className="text-xs text-gray-400 mt-1.5">
                Sélectionné : <span className="text-base">{goalForm.icon}</span>
              </p>
            )}
          </div>
          <Input
            label="Montant cible (€)" type="number" step="0.01" min="0"
            value={goalForm.targetAmount}
            onChange={(e) => setGoalForm((f) => ({ ...f, targetAmount: e.target.value }))}
            required
          />
          <Input
            label="Échéance (optionnel)" type="date"
            value={goalForm.deadline}
            onChange={(e) => setGoalForm((f) => ({ ...f, deadline: e.target.value }))}
          />
          <Button onClick={saveGoal} className="w-full" disabled={!goalForm.name || !goalForm.targetAmount}>
            {goalModal?.mode === 'edit' ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </Modal>

      {/* Contribute modal */}
      <Modal
        isOpen={!!contributeGoal}
        onClose={() => setContributeGoal(null)}
        title={`Contribuer — ${contributeGoal?.name}`}
      >
        <div className="space-y-4">
          {contributeGoal && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span>Progression actuelle</span>
                <span className="font-semibold">
                  {contributeGoal.currentAmount.toFixed(2)} / {contributeGoal.targetAmount.toFixed(2)} {contributeGoal.currency}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-budget"
                  style={{ width: `${Math.min((contributeGoal.currentAmount / contributeGoal.targetAmount) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
          <Input
            label="Montant (€)" type="number" step="0.01" min="0"
            value={contributeForm.amount}
            onChange={(e) => setContributeForm((f) => ({ ...f, amount: e.target.value }))}
            required
          />
          <Input
            label="Note (optionnel)"
            value={contributeForm.note}
            onChange={(e) => setContributeForm((f) => ({ ...f, note: e.target.value }))}
          />
          <Button onClick={saveContribution} className="w-full" disabled={!contributeForm.amount}>
            Confirmer la contribution
          </Button>
        </div>
      </Modal>

      {/* Recurring expense modal */}
      <Modal
        isOpen={!!recurringModal}
        onClose={() => setRecurringModal(null)}
        title={recurringModal?.mode === 'edit' ? 'Modifier la dépense récurrente' : 'Nouvelle dépense récurrente'}
      >
        <div className="space-y-4">
          <Input
            label="Nom"
            value={recurringForm.name}
            onChange={(e) => setRecurringForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Loyer, Netflix, Assurance..."
            required
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Montant (€)" type="number" step="0.01" min="0"
                value={recurringForm.amount}
                onChange={(e) => setRecurringForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Catégorie</label>
              <select
                value={recurringForm.category}
                onChange={(e) => setRecurringForm((f) => ({ ...f, category: e.target.value }))}
                className="input-field"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Fréquence</label>
            <div className="grid grid-cols-2 gap-2">
              {(['weekly', 'monthly', 'quarterly', 'yearly'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setRecurringForm((form) => ({ ...form, frequency: f }))}
                  className={clsx(
                    'py-2 rounded-lg border text-sm transition-colors',
                    recurringForm.frequency === f
                      ? 'border-budget bg-budget/10 text-budget font-medium'
                      : 'border-gray-200 dark:border-gray-700',
                  )}
                >
                  {RECURRING_FREQUENCY_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          <Input
            label="Date de début" type="date"
            value={recurringForm.startDate}
            onChange={(e) => setRecurringForm((f) => ({ ...f, startDate: e.target.value }))}
          />
          <Input
            label="Note (optionnel)"
            value={recurringForm.description}
            onChange={(e) => setRecurringForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Détails..."
          />
          <Button
            onClick={saveRecurring} className="w-full"
            disabled={!recurringForm.name || !recurringForm.amount}
          >
            {recurringModal?.mode === 'edit' ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Confirmer la suppression"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {deleteConfirm?.type === 'expense'   && 'Supprimer cette dépense ? Cette action est irréversible.'}
            {deleteConfirm?.type === 'income'    && 'Supprimer ce revenu ? Cette action est irréversible.'}
            {deleteConfirm?.type === 'goal'      && 'Supprimer cet objectif et toutes ses contributions ? Cette action est irréversible.'}
            {deleteConfirm?.type === 'envelope'  && 'Supprimer cette enveloppe ? Cette action est irréversible.'}
            {deleteConfirm?.type === 'recurring' && 'Supprimer cette dépense récurrente ? Les dépenses déjà générées seront conservées.'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Annuler</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteConfirm}>
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
