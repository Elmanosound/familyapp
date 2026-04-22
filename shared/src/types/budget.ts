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

export interface BudgetSummary {
  totalSpent: number;
  byCategory: { category: string; total: number }[];
  monthlyTrend: { month: string; total: number }[];
  period: { year: number; month: number };
}
