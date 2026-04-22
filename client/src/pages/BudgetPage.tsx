import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wallet, Plus, TrendingUp, Target, ChevronLeft, ChevronRight,
  Pencil, Trash2, PiggyBank, Package, Search, CheckCircle2,
  AlertTriangle, TrendingDown, Calendar,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';
import type { Expense, BudgetGoal, BudgetEnvelope, BudgetSummary } from '@familyapp/shared';
import { EXPENSE_CATEGORIES } from '@familyapp/shared';
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

// ─── Component ───────────────────────────────────────────────────────────────

export function BudgetPage() {
  const { activeFamily } = useFamilyStore();
  const familyId = activeFamily?._id;

  const [tab, setTab] = useState<'overview' | 'expenses' | 'envelopes' | 'goals'>('overview');

  // Data
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [goals, setGoals] = useState<BudgetGoal[]>([]);
  const [envelopes, setEnvelopes] = useState<BudgetEnvelope[]>([]);

  // Period filter for expenses tab
  const [period, setPeriod] = useState<Date>(startOfMonth(new Date()));
  const [search, setSearch] = useState('');

  // Expense modal
  const [expenseModal, setExpenseModal] = useState<{ mode: 'create' | 'edit'; data?: Expense } | null>(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm());

  // Goal modal
  const [goalModal, setGoalModal] = useState<{ mode: 'create' | 'edit'; data?: BudgetGoal } | null>(null);
  const [goalForm, setGoalForm] = useState(emptyGoalForm());

  // Contribute modal
  const [contributeGoal, setContributeGoal] = useState<BudgetGoal | null>(null);
  const [contributeForm, setContributeForm] = useState(emptyContributeForm());

  // Envelope modal
  const [envelopeModal, setEnvelopeModal] = useState<{ mode: 'create' | 'edit'; data?: BudgetEnvelope } | null>(null);
  const [envelopeForm, setEnvelopeForm] = useState(emptyEnvelopeForm());

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'expense' | 'goal' | 'envelope'; id: string } | null>(null);

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
      const end = format(endOfMonth(period), 'yyyy-MM-dd');
      const params: Record<string, string> = { startDate: start, endDate: end, limit: '200' };
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get(`/families/${familyId}/budget/expenses`, { params });
      setExpenses(data.expenses);
      setTotalExpenses(data.total);
    } catch { /* silent */ }
  }, [familyId, period, search]);

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

  useEffect(() => {
    fetchSummary();
    fetchGoals();
    fetchEnvelopes();
  }, [fetchSummary, fetchGoals, fetchEnvelopes]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // ── Chart data ─────────────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        label: MONTH_NAMES[d.getMonth()],
        total: summary?.monthlyTrend.find((m) => m.month === key)?.total ?? 0,
      };
    });
  }, [summary]);

  const lastMonthTotal = useMemo(() => {
    const now = new Date();
    const last = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
    const adjusted = last === `${now.getFullYear()}-00`
      ? `${now.getFullYear() - 1}-12`
      : last;
    return summary?.monthlyTrend.find((m) => m.month === adjusted)?.total ?? null;
  }, [summary]);

  // ── Expense CRUD ──────────────────────────────────────────────────────────

  const openCreateExpense = () => {
    setExpenseForm(emptyExpenseForm());
    setExpenseModal({ mode: 'create' });
  };
  const openEditExpense = (exp: Expense) => {
    setExpenseForm({
      amount: String(exp.amount),
      category: exp.category,
      description: exp.description,
      date: toLocalDate(new Date(exp.date)),
      isRecurring: exp.isRecurring,
    });
    setExpenseModal({ mode: 'edit', data: exp });
  };
  const saveExpense = async () => {
    if (!familyId || !expenseForm.amount || !expenseForm.description) return;
    const payload = {
      ...expenseForm,
      amount: parseFloat(expenseForm.amount),
      date: new Date(expenseForm.date).toISOString(),
    };
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
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const confirmDeleteExpense = async (id: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/budget/expenses/${id}`);
      toast.success('Dépense supprimée');
      setDeleteConfirm(null);
      fetchExpenses();
      fetchSummary();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  // ── Goal CRUD ────────────────────────────────────────────────────────────

  const openCreateGoal = () => {
    setGoalForm(emptyGoalForm());
    setGoalModal({ mode: 'create' });
  };
  const openEditGoal = (goal: BudgetGoal) => {
    setGoalForm({
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currency: goal.currency,
      deadline: goal.deadline ? toLocalDate(new Date(goal.deadline)) : '',
      icon: goal.icon ?? '',
    });
    setGoalModal({ mode: 'edit', data: goal });
  };
  const saveGoal = async () => {
    if (!familyId || !goalForm.name || !goalForm.targetAmount) return;
    const payload = {
      name: goalForm.name,
      targetAmount: parseFloat(goalForm.targetAmount),
      currency: goalForm.currency,
      deadline: goalForm.deadline || undefined,
      icon: goalForm.icon || undefined,
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
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const openContribute = (goal: BudgetGoal) => {
    setContributeForm(emptyContributeForm());
    setContributeGoal(goal);
  };
  const saveContribution = async () => {
    if (!familyId || !contributeGoal || !contributeForm.amount) return;
    try {
      await api.post(`/families/${familyId}/budget/goals/${contributeGoal._id}/contribute`, {
        amount: parseFloat(contributeForm.amount),
        note: contributeForm.note || undefined,
      });
      toast.success('Contribution ajoutée !');
      setContributeGoal(null);
      fetchGoals();
    } catch {
      toast.error("Erreur lors de l'ajout");
    }
  };

  const confirmDeleteGoal = async (id: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/budget/goals/${id}`);
      toast.success('Objectif supprimé');
      setDeleteConfirm(null);
      fetchGoals();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  // ── Envelope CRUD ────────────────────────────────────────────────────────

  const openCreateEnvelope = () => {
    setEnvelopeForm(emptyEnvelopeForm());
    setEnvelopeModal({ mode: 'create' });
  };
  const openEditEnvelope = (env: BudgetEnvelope) => {
    setEnvelopeForm({
      name: env.name,
      budgetedAmount: String(env.budgetedAmount),
      currency: env.currency,
      period: env.period,
      category: env.category ?? '',
      color: env.color,
      icon: env.icon ?? '',
    });
    setEnvelopeModal({ mode: 'edit', data: env });
  };
  const saveEnvelope = async () => {
    if (!familyId || !envelopeForm.name || !envelopeForm.budgetedAmount) return;
    const payload = {
      name: envelopeForm.name,
      budgetedAmount: parseFloat(envelopeForm.budgetedAmount),
      currency: envelopeForm.currency,
      period: envelopeForm.period,
      category: envelopeForm.category || null,
      color: envelopeForm.color,
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
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const confirmDeleteEnvelope = async (id: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/budget/envelopes/${id}`);
      toast.success('Enveloppe supprimée');
      setDeleteConfirm(null);
      fetchEnvelopes();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  // ── Delete dispatch ──────────────────────────────────────────────────────

  const handleDeleteConfirm = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'expense') confirmDeleteExpense(deleteConfirm.id);
    else if (deleteConfirm.type === 'goal') confirmDeleteGoal(deleteConfirm.id);
    else if (deleteConfirm.type === 'envelope') confirmDeleteEnvelope(deleteConfirm.id);
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
    { key: 'overview', label: 'Vue d\'ensemble', icon: TrendingUp },
    { key: 'expenses', label: 'Dépenses', icon: Wallet },
    { key: 'envelopes', label: 'Enveloppes', icon: Package },
    { key: 'goals', label: 'Objectifs', icon: Target },
  ] as const;

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
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors',
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
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4">
              <p className="text-xs text-gray-500 mb-1">Ce mois</p>
              <p className="text-xl font-bold">{summary?.totalSpent.toFixed(2) ?? '—'} €</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 mb-1">Mois dernier</p>
              <div className="flex items-center gap-1">
                <p className="text-xl font-bold">{lastMonthTotal?.toFixed(2) ?? '—'} €</p>
                {lastMonthTotal != null && summary?.totalSpent != null && (
                  summary.totalSpent > lastMonthTotal
                    ? <TrendingUp className="w-4 h-4 text-red-500" />
                    : <TrendingDown className="w-4 h-4 text-green-500" />
                )}
              </div>
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

          {/* Bar chart — monthly trend */}
          <div className="card p-4">
            <h3 className="font-semibold text-sm mb-4">Dépenses sur 12 mois</h3>
            {chartData.some((d) => d.total > 0) ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}€`} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toFixed(2)} €`, 'Dépenses']}
                    cursor={{ fill: 'rgba(139,92,246,0.08)' }}
                  />
                  <Bar dataKey="total" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Aucune dépense enregistrée</p>
            )}
          </div>

          {/* Category breakdown */}
          {summary && summary.byCategory.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-sm mb-4">Répartition ce mois</h3>
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

          {/* Quick expense button */}
          <Button onClick={openCreateExpense} variant="secondary" className="w-full">
            <Plus className="w-4 h-4 mr-2" /> Ajouter une dépense
          </Button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: Dépenses
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          {/* Period navigator */}
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

          {/* Total */}
          {expenses.length > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-500 px-1">
              <span>{totalExpenses} dépense{totalExpenses > 1 ? 's' : ''}</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                Total : {expenses.reduce((s, e) => s + e.amount, 0).toFixed(2)} €
              </span>
            </div>
          )}

          {/* Expense list */}
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

                    {/* Progress bar */}
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
                      <span
                        className={clsx('font-semibold', envelopeColor(env.spentAmount, env.budgetedAmount))}
                      >
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
                    {/* Header */}
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

                    {/* Progress */}
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

                    {/* Projection */}
                    {projection && !goal.isCompleted && (
                      <p className="text-xs text-gray-400 mb-3">
                        À ce rythme, atteint en <span className="font-medium text-gray-600">{projection}</span>
                      </p>
                    )}

                    {/* Contributions count */}
                    {goal.contributions.length > 0 && (
                      <p className="text-xs text-gray-400 mb-3">
                        {goal.contributions.length} contribution{goal.contributions.length > 1 ? 's' : ''}
                      </p>
                    )}

                    {/* Contribute button */}
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
            label="Montant (€)"
            type="number"
            step="0.01"
            min="0"
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
            label="Date"
            type="date"
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
          <Button
            onClick={saveExpense}
            className="w-full"
            disabled={!expenseForm.amount || !expenseForm.description}
          >
            {expenseModal?.mode === 'edit' ? 'Enregistrer' : 'Ajouter'}
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
            label="Budget (€)"
            type="number"
            step="0.01"
            min="0"
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
            onClick={saveEnvelope}
            className="w-full"
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
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                label="Nom"
                value={goalForm.name}
                onChange={(e) => setGoalForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="w-24">
              <Input
                label="Icône"
                value={goalForm.icon}
                onChange={(e) => setGoalForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="🏖️"
              />
            </div>
          </div>
          <Input
            label="Montant cible (€)"
            type="number"
            step="0.01"
            min="0"
            value={goalForm.targetAmount}
            onChange={(e) => setGoalForm((f) => ({ ...f, targetAmount: e.target.value }))}
            required
          />
          <Input
            label="Échéance (optionnel)"
            type="date"
            value={goalForm.deadline}
            onChange={(e) => setGoalForm((f) => ({ ...f, deadline: e.target.value }))}
          />
          <Button
            onClick={saveGoal}
            className="w-full"
            disabled={!goalForm.name || !goalForm.targetAmount}
          >
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
            label="Montant (€)"
            type="number"
            step="0.01"
            min="0"
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

      {/* Delete confirm modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Confirmer la suppression"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {deleteConfirm?.type === 'expense' && 'Supprimer cette dépense ? Cette action est irréversible.'}
            {deleteConfirm?.type === 'goal' && 'Supprimer cet objectif et toutes ses contributions ? Cette action est irréversible.'}
            {deleteConfirm?.type === 'envelope' && 'Supprimer cette enveloppe ? Cette action est irréversible.'}
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
