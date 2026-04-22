export const INCOME_CATEGORIES = [
  'salary',
  'freelance',
  'rental',
  'investment',
  'gift',
  'other',
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  salary:     'Salaire',
  freelance:  'Freelance',
  rental:     'Loyer perçu',
  investment: 'Investissement',
  gift:       'Don / Cadeau',
  other:      'Autre',
};

export const EXPENSE_CATEGORIES = [
  'groceries',
  'utilities',
  'transport',
  'entertainment',
  'health',
  'education',
  'clothing',
  'housing',
  'dining',
  'subscriptions',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  _id: string;
  familyId: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  date: string;
  paidBy: { id: string; firstName: string; lastName: string };
  splitBetween?: string[];
  receiptUrl?: string;
  isRecurring: boolean;
  createdAt: string;
}

export interface BudgetGoalContribution {
  _id: string;
  user: { id: string; firstName: string; lastName: string };
  amount: number;
  date: string;
  note?: string;
}

export interface BudgetGoal {
  _id: string;
  familyId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  deadline?: string;
  icon?: string;
  createdBy: { id: string; firstName: string; lastName: string };
  contributions: BudgetGoalContribution[];
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetEnvelope {
  _id: string;
  familyId: string;
  name: string;
  budgetedAmount: number;
  currency: string;
  period: 'monthly' | 'weekly' | 'yearly';
  category?: string | null;
  color: string;
  icon?: string | null;
  isActive: boolean;
  spentAmount: number; // computed server-side
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseData {
  amount: number;
  category: string;
  description: string;
  date: string;
  splitBetween?: string[];
}

export interface CreateGoalData {
  name: string;
  targetAmount: number;
  currency?: string;
  deadline?: string;
  icon?: string;
}

export interface CreateEnvelopeData {
  name: string;
  budgetedAmount: number;
  currency?: string;
  period?: 'monthly' | 'weekly' | 'yearly';
  category?: string;
  color?: string;
  icon?: string;
}

export const RECURRING_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  yearly: 'Annuel',
};

/** Factor to convert this frequency's amount into a monthly equivalent. */
export const RECURRING_MONTHLY_FACTOR: Record<RecurringFrequency, number> = {
  weekly: 52 / 12,   // ≈ 4.33
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

export interface Income {
  _id: string;
  familyId: string;
  amount: number;
  currency: string;
  category: string;
  description?: string | null;
  date: string;
  receivedBy: { id: string; firstName: string; lastName: string };
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringExpense {
  _id: string;
  familyId: string;
  name: string;
  amount: number;
  currency: string;
  category: string;
  description?: string | null;
  frequency: RecurringFrequency;
  startDate: string;
  nextDueDate: string;
  lastPaidAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetSummary {
  totalSpent: number;
  totalIncome: number;
  balance: number;     // totalIncome - totalSpent
  savingsRate: number; // (balance / totalIncome) * 100, or 0 when no income
  byCategory: { category: string; total: number }[];
  monthlyTrend: { month: string; expenses: number; income: number }[];
  period: { year: number; month: number };
}
