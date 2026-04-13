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
  category: ExpenseCategory;
  description: string;
  date: string;
  paidBy: string;
  splitBetween?: string[];
  receiptUrl?: string;
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetGoalContribution {
  user: string;
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
  createdBy: string;
  contributions: BudgetGoalContribution[];
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseData {
  amount: number;
  category: ExpenseCategory;
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

export interface BudgetSummary {
  totalSpent: number;
  byCategory: { category: ExpenseCategory; total: number }[];
  monthlyTrend: { month: string; total: number }[];
}
