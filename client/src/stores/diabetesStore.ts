import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GlucoseContext = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'night' | 'other';
export type InsulinType = 'rapid' | 'slow';
export type ActivityIntensity = 'light' | 'moderate' | 'intense';
export type GlucoseUnit = 'mg/dL' | 'mmol/L';

export interface GlucoseReading {
  id: string;
  timestamp: string;
  value: number; // stored in mg/dL
  context: GlucoseContext;
  note?: string;
}

export interface InsulinDose {
  id: string;
  timestamp: string;
  type: InsulinType;
  units: number;
  insulinName?: string;
  note?: string;
}

export interface MealEntry {
  id: string;
  timestamp: string;
  name: string;
  carbs: number; // grams
  note?: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  activity: string;
  duration: number; // minutes
  intensity: ActivityIntensity;
  note?: string;
}

export interface DiabetesSettings {
  unit: GlucoseUnit;
  targetLow: number;   // mg/dL (default 70)
  targetHigh: number;  // mg/dL (default 140)
  hypoThreshold: number;  // mg/dL (default 70)
  hyperThreshold: number; // mg/dL (default 180)
}

interface DiabetesState {
  glucose: GlucoseReading[];
  insulin: InsulinDose[];
  meals: MealEntry[];
  activities: ActivityEntry[];
  settings: DiabetesSettings;
  addGlucose: (r: Omit<GlucoseReading, 'id'>) => void;
  deleteGlucose: (id: string) => void;
  addInsulin: (d: Omit<InsulinDose, 'id'>) => void;
  deleteInsulin: (id: string) => void;
  addMeal: (m: Omit<MealEntry, 'id'>) => void;
  deleteMeal: (id: string) => void;
  addActivity: (a: Omit<ActivityEntry, 'id'>) => void;
  deleteActivity: (id: string) => void;
  updateSettings: (s: Partial<DiabetesSettings>) => void;
}

const DEFAULT_SETTINGS: DiabetesSettings = {
  unit: 'mmol/L',
  targetLow: 70,
  targetHigh: 140,
  hypoThreshold: 70,
  hyperThreshold: 180,
};

export const useDiabetesStore = create<DiabetesState>()(
  persist(
    (set) => ({
      glucose: [],
      insulin: [],
      meals: [],
      activities: [],
      settings: DEFAULT_SETTINGS,

      addGlucose: (r) =>
        set((s) => ({ glucose: [...s.glucose, { ...r, id: crypto.randomUUID() }] })),
      deleteGlucose: (id) =>
        set((s) => ({ glucose: s.glucose.filter((r) => r.id !== id) })),

      addInsulin: (d) =>
        set((s) => ({ insulin: [...s.insulin, { ...d, id: crypto.randomUUID() }] })),
      deleteInsulin: (id) =>
        set((s) => ({ insulin: s.insulin.filter((d) => d.id !== id) })),

      addMeal: (m) =>
        set((s) => ({ meals: [...s.meals, { ...m, id: crypto.randomUUID() }] })),
      deleteMeal: (id) =>
        set((s) => ({ meals: s.meals.filter((m) => m.id !== id) })),

      addActivity: (a) =>
        set((s) => ({ activities: [...s.activities, { ...a, id: crypto.randomUUID() }] })),
      deleteActivity: (id) =>
        set((s) => ({ activities: s.activities.filter((a) => a.id !== id) })),

      updateSettings: (partial) =>
        set((state) => ({ settings: { ...state.settings, ...partial } })),
    }),
    { name: 'diabetes-storage' },
  ),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

export const MG_PER_MMOL = 18.0182;

export function toDisplay(mgdl: number, unit: GlucoseUnit): string {
  return unit === 'mmol/L' ? (mgdl / MG_PER_MMOL).toFixed(1) : mgdl.toFixed(0);
}

export function fromDisplay(val: number, unit: GlucoseUnit): number {
  return unit === 'mmol/L' ? val * MG_PER_MMOL : val;
}

export function glucoseStatus(
  mgdl: number,
  settings: DiabetesSettings,
): 'hypo' | 'low' | 'target' | 'high' | 'hyper' {
  if (mgdl < settings.hypoThreshold) return 'hypo';
  if (mgdl < settings.targetLow) return 'low';
  if (mgdl <= settings.targetHigh) return 'target';
  if (mgdl <= settings.hyperThreshold) return 'high';
  return 'hyper';
}

export const STATUS_LABELS: Record<string, string> = {
  hypo: 'Hypoglycémie',
  low: 'En dessous de la cible',
  target: 'Dans la cible',
  high: 'Au-dessus de la cible',
  hyper: 'Hyperglycémie',
};

export const STATUS_COLORS: Record<string, string> = {
  hypo: 'text-red-600 bg-red-50 border-red-200',
  low: 'text-orange-500 bg-orange-50 border-orange-200',
  target: 'text-green-600 bg-green-50 border-green-200',
  high: 'text-orange-600 bg-orange-50 border-orange-200',
  hyper: 'text-red-700 bg-red-50 border-red-200',
};

export const STATUS_TEXT_COLORS: Record<string, string> = {
  hypo: 'text-red-600',
  low: 'text-orange-500',
  target: 'text-green-600',
  high: 'text-orange-600',
  hyper: 'text-red-700',
};

export const CONTEXT_LABELS: Record<GlucoseContext, string> = {
  fasting: 'À jeun',
  before_meal: 'Avant repas',
  after_meal: 'Après repas',
  bedtime: 'Coucher',
  night: 'Nuit',
  other: 'Autre',
};

export const INTENSITY_LABELS: Record<ActivityIntensity, string> = {
  light: 'Légère',
  moderate: 'Modérée',
  intense: 'Intense',
};
