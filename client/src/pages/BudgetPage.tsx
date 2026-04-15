import { useState, useEffect, useCallback } from 'react';
import { Wallet, Plus, TrendingUp, Target } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';
import type { Expense, BudgetGoal, BudgetSummary } from '@familyapp/shared';
import { EXPENSE_CATEGORIES } from '@familyapp/shared';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const categoryLabels: Record<string, string> = {
  groceries: 'Courses', utilities: 'Factures', transport: 'Transport',
  entertainment: 'Loisirs', health: 'Sante', education: 'Education',
  clothing: 'Vetements', housing: 'Logement', dining: 'Restaurant',
  subscriptions: 'Abonnements', other: 'Autre',
};

const categoryColors: Record<string, string> = {
  groceries: '#22c55e', utilities: '#3b82f6', transport: '#f59e0b',
  entertainment: '#ec4899', health: '#ef4444', education: '#8b5cf6',
  clothing: '#14b8a6', housing: '#6366f1', dining: '#f97316',
  subscriptions: '#06b6d4', other: '#6b7280',
};

// Return "YYYY-MM-DD" in the user's local timezone. Using Date#toISOString
// here would silently switch to UTC, so a selection made late in the evening
// (Paris time) would round-trip as the previous day.
function toLocalDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function BudgetPage() {
  const { activeFamily } = useFamilyStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [goals, setGoals] = useState<BudgetGoal[]>([]);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [form, setForm] = useState({ amount: '', category: 'groceries', description: '', date: toLocalDateInputValue(new Date()) });

  const fetchData = useCallback(async () => {
    if (!activeFamily) return;
    const [expRes, goalRes, sumRes] = await Promise.all([
      api.get(`/families/${activeFamily._id}/budget/expenses`),
      api.get(`/families/${activeFamily._id}/budget/goals`),
      api.get(`/families/${activeFamily._id}/budget/summary`),
    ]);
    setExpenses(expRes.data.expenses);
    setGoals(goalRes.data.goals);
    setSummary(sumRes.data);
  }, [activeFamily]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createExpense = async () => {
    if (!activeFamily || !form.amount || !form.description) return;
    await api.post(`/families/${activeFamily._id}/budget/expenses`, {
      ...form,
      amount: parseFloat(form.amount),
      date: new Date(form.date).toISOString(),
    });
    setShowExpenseForm(false);
    setForm({ amount: '', category: 'groceries', description: '', date: toLocalDateInputValue(new Date()) });
    fetchData();
    toast.success('Depense ajoutee');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Budget</h2>
        <Button size="sm" onClick={() => setShowExpenseForm(true)}>
          <Plus className="w-4 h-4 mr-1" /> Depense
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-budget/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-budget" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Ce mois</p>
              <p className="text-xl font-bold">{summary?.totalSpent.toFixed(2) || '0.00'} EUR</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Categories</p>
              <p className="text-xl font-bold">{summary?.byCategory.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Target className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Objectifs</p>
              <p className="text-xl font-bold">{goals.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {summary && summary.byCategory.length > 0 && (
        <div className="card p-4 mb-6">
          <h3 className="font-semibold mb-3">Repartition par categorie</h3>
          <div className="space-y-2">
            {summary.byCategory.map((cat) => (
              <div key={cat.category} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: categoryColors[cat.category] || '#6b7280' }} />
                <span className="text-sm flex-1">{categoryLabels[cat.category] || cat.category}</span>
                <span className="text-sm font-medium">{cat.total.toFixed(2)} EUR</span>
                <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${(cat.total / summary.totalSpent) * 100}%`, backgroundColor: categoryColors[cat.category] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expenses list */}
      <div className="card">
        <h3 className="font-semibold p-4 border-b border-gray-200 dark:border-gray-700">Dernieres depenses</h3>
        {expenses.length === 0 ? (
          <EmptyState icon={<Wallet className="w-12 h-12" />} title="Aucune depense" description="Ajoutez votre premiere depense" />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {expenses.map((exp) => (
              <div key={exp._id} className="flex items-center gap-3 p-4">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColors[exp.category] || '#6b7280' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{exp.description}</p>
                  <p className="text-xs text-gray-500">{categoryLabels[exp.category]} - {format(new Date(exp.date), 'dd/MM/yyyy')}</p>
                </div>
                <span className="font-semibold text-sm">{exp.amount.toFixed(2)} EUR</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Goals */}
      {goals.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-3">Objectifs d'epargne</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {goals.map((goal) => (
              <div key={goal._id} className="card p-4">
                <h4 className="font-medium mb-2">{goal.name}</h4>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className={clsx('h-3 rounded-full', goal.isCompleted ? 'bg-green-500' : 'bg-budget')}
                      style={{ width: `${Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <p className="text-sm text-gray-500">{goal.currentAmount.toFixed(2)} / {goal.targetAmount.toFixed(2)} {goal.currency}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showExpenseForm} onClose={() => setShowExpenseForm(false)} title="Nouvelle depense">
        <div className="space-y-4">
          <Input label="Montant" type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
          <div>
            <label className="block text-sm font-medium mb-1">Categorie</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="input-field"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{categoryLabels[c] || c}</option>
              ))}
            </select>
          </div>
          <Input label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required />
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <Button onClick={createExpense} className="w-full">Ajouter</Button>
        </div>
      </Modal>
    </div>
  );
}
