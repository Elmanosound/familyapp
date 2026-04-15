import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UtensilsCrossed, Plus, Clock, Users, ChevronLeft, ChevronRight,
  ShoppingCart, Trash2, X, Loader2, Link as LinkIcon,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';
import type { Recipe, Ingredient, GroceryItem } from '@familyapp/shared';
import toast from 'react-hot-toast';
import { startOfWeek, addWeeks, addDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const;
const SLOTS = [
  { key: 'breakfast', label: 'Petit-déj' },
  { key: 'lunch', label: 'Déjeuner' },
  { key: 'dinner', label: 'Dîner' },
] as const;

type SlotKey = 'breakfast' | 'lunch' | 'dinner';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseMondayWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

function formatWeekStart(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** The backend stores arrays as JSON strings in SQLite. Parse them safely. */
function safeParse<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value as T) ?? fallback;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface MealSlotData {
  id?: string;
  dayOfWeek: number;
  mealType: string;
  recipeId?: string | null;
  recipe?: { id: string; name: string; imageUrl?: string; prepTime?: number; cookTime?: number } | null;
}

interface MealPlanData {
  id: string;
  weekStartDate: string;
  meals: MealSlotData[];
}

interface RecipeFormState {
  name: string;
  description: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  tags: string;
  ingredients: { name: string; quantity: string; unit: string }[];
  instructions: string[];
  imageUrl?: string;
  sourceUrl?: string;
}

const emptyRecipeForm: RecipeFormState = {
  name: '',
  description: '',
  servings: '4',
  prepTime: '',
  cookTime: '',
  tags: '',
  ingredients: [{ name: '', quantity: '', unit: '' }],
  instructions: [''],
  imageUrl: undefined,
  sourceUrl: undefined,
};

/** Shape returned by POST /meals/recipes/import. All fields optional. */
interface ImportedRecipe {
  name?: string;
  description?: string;
  imageUrl?: string;
  servings?: number;
  prepTime?: number;
  cookTime?: number;
  ingredients?: { name: string; quantity: number; unit: string }[];
  instructions?: string[];
  tags?: string[];
  sourceUrl?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function MealPlanPage() {
  const { activeFamily } = useFamilyStore();
  const familyId = activeFamily?._id;

  const [tab, setTab] = useState<'planner' | 'recipes'>('planner');

  // Recipe state
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);

  // Planner state
  const [weekStart, setWeekStart] = useState(() => parseMondayWeekStart(new Date()));
  const [plan, setPlan] = useState<MealPlanData | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Slot picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDay, setPickerDay] = useState(0);
  const [pickerSlot, setPickerSlot] = useState<SlotKey>('breakfast');
  const [pickerSearch, setPickerSearch] = useState('');

  // Recipe form modal
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [recipeForm, setRecipeForm] = useState<RecipeFormState>({ ...emptyRecipeForm });
  const [creatingRecipe, setCreatingRecipe] = useState(false);

  // URL import modal — a small dialog that asks for a URL, calls the backend
  // importer, then pre-fills the main "new recipe" form so the user can review
  // before saving. Keeping this as a separate modal (rather than a field inside
  // the main form) keeps the happy path clean.
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  // Grocery list modal
  const [groceryList, setGroceryList] = useState<GroceryItem[] | null>(null);
  const [groceryOpen, setGroceryOpen] = useState(false);
  const [groceryLoading, setGroceryLoading] = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────

  /** Map from "day-slot" to recipe info for quick lookups */
  const slotMap = useMemo(() => {
    const m = new Map<string, MealSlotData>();
    if (plan) {
      for (const meal of plan.meals) {
        m.set(`${meal.dayOfWeek}-${meal.mealType}`, meal);
      }
    }
    return m;
  }, [plan]);

  const filteredRecipes = useMemo(() => {
    if (!pickerSearch) return recipes;
    const q = pickerSearch.toLowerCase();
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, pickerSearch]);

  // ── Fetch recipes ────────────────────────────────────────────────────────

  const fetchRecipes = useCallback(async () => {
    if (!familyId) return;
    setRecipesLoading(true);
    try {
      const { data } = await api.get(`/families/${familyId}/meals/recipes`);
      const parsed = (data.recipes as Record<string, unknown>[]).map((r) => ({
        ...r,
        tags: safeParse<string[]>(r.tags, []),
        ingredients: safeParse<Ingredient[]>(r.ingredients, []),
        instructions: safeParse<string[]>(r.instructions, []),
      })) as unknown as Recipe[];
      setRecipes(parsed);
    } catch {
      toast.error('Erreur lors du chargement des recettes');
    } finally {
      setRecipesLoading(false);
    }
  }, [familyId]);

  // ── Fetch meal plan for current week ─────────────────────────────────────

  const fetchPlan = useCallback(async () => {
    if (!familyId) return;
    setPlanLoading(true);
    try {
      const { data } = await api.get(`/families/${familyId}/meals/plans`, {
        params: { weekStartDate: formatWeekStart(weekStart) },
      });
      const plans = data.plans as MealPlanData[];
      setPlan(plans.length > 0 ? plans[0] : null);
    } catch {
      toast.error('Erreur lors du chargement du planning');
    } finally {
      setPlanLoading(false);
    }
  }, [familyId, weekStart]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // ── Assign recipe to slot ────────────────────────────────────────────────

  const assignRecipe = async (day: number, slot: SlotKey, recipeId: string) => {
    if (!familyId) return;

    // Build the full meals array: keep existing assignments, override the target
    const existing = plan?.meals ?? [];
    const mealsMap = new Map<string, { dayOfWeek: number; mealType: string; recipeId: string }>();
    for (const m of existing) {
      if (m.recipeId) {
        mealsMap.set(`${m.dayOfWeek}-${m.mealType}`, {
          dayOfWeek: m.dayOfWeek,
          mealType: m.mealType,
          recipeId: m.recipeId,
        });
      }
    }
    mealsMap.set(`${day}-${slot}`, { dayOfWeek: day, mealType: slot, recipeId });

    const meals = Array.from(mealsMap.values());
    setSaving(true);
    try {
      const { data } = await api.post(`/families/${familyId}/meals/plans`, {
        weekStartDate: formatWeekStart(weekStart),
        meals,
      });
      setPlan(data.plan as MealPlanData);
      toast.success('Repas enregistré');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
      setPickerOpen(false);
    }
  };

  // ── Remove recipe from slot ──────────────────────────────────────────────

  const removeSlot = async (day: number, slot: SlotKey) => {
    if (!familyId) return;
    const existing = plan?.meals ?? [];
    const meals = existing
      .filter((m) => !(m.dayOfWeek === day && m.mealType === slot))
      .filter((m) => m.recipeId)
      .map((m) => ({ dayOfWeek: m.dayOfWeek, mealType: m.mealType, recipeId: m.recipeId! }));

    setSaving(true);
    try {
      const { data } = await api.post(`/families/${familyId}/meals/plans`, {
        weekStartDate: formatWeekStart(weekStart),
        meals,
      });
      setPlan(data.plan as MealPlanData);
      toast.success('Repas retiré');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  // ── Create recipe ────────────────────────────────────────────────────────

  const createRecipe = async () => {
    if (!familyId || !recipeForm.name.trim()) return;
    setCreatingRecipe(true);
    try {
      await api.post(`/families/${familyId}/meals/recipes`, {
        name: recipeForm.name.trim(),
        description: recipeForm.description.trim() || undefined,
        imageUrl: recipeForm.imageUrl || undefined,
        sourceUrl: recipeForm.sourceUrl || undefined,
        servings: parseInt(recipeForm.servings) || 4,
        prepTime: recipeForm.prepTime ? parseInt(recipeForm.prepTime) : undefined,
        cookTime: recipeForm.cookTime ? parseInt(recipeForm.cookTime) : undefined,
        ingredients: recipeForm.ingredients
          .filter((i) => i.name.trim())
          .map((i) => ({ name: i.name.trim(), quantity: parseFloat(i.quantity) || 0, unit: i.unit.trim() })),
        instructions: recipeForm.instructions.filter((s) => s.trim()),
        tags: recipeForm.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setShowRecipeForm(false);
      setRecipeForm({ ...emptyRecipeForm });
      fetchRecipes();
      toast.success('Recette ajoutée');
    } catch {
      toast.error('Erreur lors de la création');
    } finally {
      setCreatingRecipe(false);
    }
  };

  // ── Import recipe from URL ───────────────────────────────────────────────

  /**
   * Hit the server-side importer, then map the draft it returns into the
   * existing recipe-form shape (which uses string values for the number
   * fields so they can be edited freely). The user ends up in the same
   * creation modal they'd use manually, just with the fields filled in.
   */
  const importFromUrl = async () => {
    if (!familyId || !importUrl.trim()) return;
    setImporting(true);
    try {
      const { data } = await api.post<{ recipe: ImportedRecipe; warning?: string }>(
        `/families/${familyId}/meals/recipes/import`,
        { url: importUrl.trim() },
      );
      const r = data.recipe;

      setRecipeForm({
        name: r.name ?? '',
        description: r.description ?? '',
        servings: r.servings != null ? String(r.servings) : '4',
        prepTime: r.prepTime != null ? String(r.prepTime) : '',
        cookTime: r.cookTime != null ? String(r.cookTime) : '',
        tags: (r.tags ?? []).join(', '),
        ingredients:
          r.ingredients && r.ingredients.length > 0
            ? r.ingredients.map((i) => ({
                name: i.name,
                quantity: i.quantity ? String(i.quantity) : '',
                unit: i.unit ?? '',
              }))
            : [{ name: '', quantity: '', unit: '' }],
        instructions:
          r.instructions && r.instructions.length > 0 ? r.instructions : [''],
        imageUrl: r.imageUrl,
        sourceUrl: r.sourceUrl ?? importUrl.trim(),
      });

      setShowUrlImport(false);
      setImportUrl('');
      setShowRecipeForm(true);

      if (data.warning) {
        toast(data.warning, { icon: 'ℹ️', duration: 5000 });
      } else {
        toast.success('Recette importée — vérifie puis enregistre');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Impossible d'importer cette recette";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  // ── Delete recipe ────────────────────────────────────────────────────────

  const deleteRecipe = async (recipeId: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/meals/recipes/${recipeId}`);
      fetchRecipes();
      toast.success('Recette supprimée');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  // ── Generate grocery list ────────────────────────────────────────────────

  const generateGroceryList = async () => {
    if (!familyId || !plan) return;
    setGroceryLoading(true);
    try {
      const { data } = await api.get(`/families/${familyId}/meals/plans/${plan.id}/grocery`);
      setGroceryList(data.groceryList as GroceryItem[]);
      setGroceryOpen(true);
    } catch {
      toast.error('Erreur lors de la génération');
    } finally {
      setGroceryLoading(false);
    }
  };

  // ── Week navigation ──────────────────────────────────────────────────────

  const prevWeek = () => setWeekStart((w) => addWeeks(w, -1));
  const nextWeek = () => setWeekStart((w) => addWeeks(w, 1));
  const goToday = () => setWeekStart(parseMondayWeekStart(new Date()));

  // ── Open picker ──────────────────────────────────────────────────────────

  const openPicker = (day: number, slot: SlotKey) => {
    setPickerDay(day);
    setPickerSlot(slot);
    setPickerSearch('');
    setPickerOpen(true);
  };

  // ── Ingredient helpers ───────────────────────────────────────────────────

  const addIngredient = () =>
    setRecipeForm((f) => ({ ...f, ingredients: [...f.ingredients, { name: '', quantity: '', unit: '' }] }));

  const removeIngredient = (idx: number) =>
    setRecipeForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== idx) }));

  const updateIngredient = (idx: number, field: keyof RecipeFormState['ingredients'][0], value: string) =>
    setRecipeForm((f) => ({
      ...f,
      ingredients: f.ingredients.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing)),
    }));

  // ── Instruction helpers ──────────────────────────────────────────────────

  const addInstruction = () =>
    setRecipeForm((f) => ({ ...f, instructions: [...f.instructions, ''] }));

  const removeInstruction = (idx: number) =>
    setRecipeForm((f) => ({ ...f, instructions: f.instructions.filter((_, i) => i !== idx) }));

  const updateInstruction = (idx: number, value: string) =>
    setRecipeForm((f) => ({
      ...f,
      instructions: f.instructions.map((s, i) => (i === idx ? value : s)),
    }));

  // ── Render ─────────────────────────────────────────────────────────────

  if (!familyId) {
    return (
      <EmptyState
        icon={<UtensilsCrossed className="w-12 h-12" />}
        title="Aucune famille active"
        description="Sélectionnez ou créez une famille pour accéder aux repas."
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Repas</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => setTab('planner')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            tab === 'planner' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''
          }`}
        >
          Planning
        </button>
        <button
          onClick={() => setTab('recipes')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            tab === 'recipes' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''
          }`}
        >
          Recettes ({recipes.length})
        </button>
      </div>

      {/* ─── Planning Tab ─────────────────────────────────────────────── */}
      {tab === 'planner' && (
        <div>
          {/* Week navigation */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={prevWeek}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[220px] text-center">
                {format(weekStart, 'd MMM', { locale: fr })} &ndash;{' '}
                {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: fr })}
              </span>
              <Button variant="ghost" size="sm" onClick={nextWeek}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={goToday}>
                Aujourd&apos;hui
              </Button>
            </div>
            <div className="flex gap-2">
              {plan && plan.meals.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={generateGroceryList}
                  isLoading={groceryLoading}
                >
                  <ShoppingCart className="w-4 h-4 mr-1" />
                  Générer la liste de courses
                </Button>
              )}
            </div>
          </div>

          {/* Week grid */}
          {planLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <div className="grid grid-cols-1 sm:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-gray-200 dark:divide-gray-700 min-w-[700px]">
                {DAYS.map((dayLabel, dayIdx) => (
                  <div key={dayLabel} className="p-3 min-w-[100px]">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">{dayLabel}</h4>
                    <p className="text-[10px] text-gray-400 mb-2">
                      {format(addDays(weekStart, dayIdx), 'd MMM', { locale: fr })}
                    </p>
                    <div className="space-y-2">
                      {SLOTS.map(({ key, label }) => {
                        const meal = slotMap.get(`${dayIdx}-${key}`);
                        const hasRecipe = meal?.recipe;

                        return (
                          <div
                            key={key}
                            className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg group relative cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                            onClick={() => !hasRecipe && openPicker(dayIdx, key)}
                          >
                            <p className="text-[10px] text-gray-400 uppercase font-medium">{label}</p>
                            {hasRecipe ? (
                              <div className="flex items-start justify-between gap-1 mt-1">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 leading-tight">
                                  {meal.recipe!.name}
                                </p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeSlot(dayIdx, key);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                                  title="Retirer"
                                >
                                  <X className="w-3 h-3 text-red-500" />
                                </button>
                              </div>
                            ) : (
                              <button
                                className="flex items-center gap-1 mt-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPicker(dayIdx, key);
                                }}
                              >
                                <Plus className="w-3 h-3" /> Ajouter
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Recettes Tab ─────────────────────────────────────────────── */}
      {tab === 'recipes' && (
        <div>
          <div className="flex justify-end gap-2 mb-4">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setImportUrl('');
                setShowUrlImport(true);
              }}
            >
              <LinkIcon className="w-4 h-4 mr-1" /> Importer depuis une URL
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setRecipeForm({ ...emptyRecipeForm });
                setShowRecipeForm(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" /> Ajouter une recette
            </Button>
          </div>

          {recipesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : recipes.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed className="w-12 h-12" />}
              title="Aucune recette"
              description="Ajoutez vos recettes favorites ou importez-les depuis une URL"
              action={
                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={() => {
                      setImportUrl('');
                      setShowUrlImport(true);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    <LinkIcon className="w-4 h-4 mr-1" /> Importer
                  </Button>
                  <Button
                    onClick={() => {
                      setRecipeForm({ ...emptyRecipeForm });
                      setShowRecipeForm(true);
                    }}
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Ajouter
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recipes.map((recipe) => (
                <div key={recipe._id} className="card overflow-hidden group relative">
                  {recipe.imageUrl ? (
                    <img src={recipe.imageUrl} alt={recipe.name} className="h-40 w-full object-cover" />
                  ) : (
                    <div className="h-40 bg-meals/10 flex items-center justify-center">
                      <UtensilsCrossed className="w-10 h-10 text-meals" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium mb-1">{recipe.name}</h3>
                      <button
                        onClick={() => deleteRecipe(recipe._id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                    {recipe.description && (
                      <p className="text-sm text-gray-500 mb-2 line-clamp-2">{recipe.description}</p>
                    )}
                    <div className="flex gap-3 text-xs text-gray-500">
                      {recipe.prepTime != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {recipe.prepTime}min prep
                        </span>
                      )}
                      {recipe.cookTime != null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {recipe.cookTime}min cuisson
                        </span>
                      )}
                      {recipe.servings != null && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {recipe.servings} pers.
                        </span>
                      )}
                    </div>
                    {recipe.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {recipe.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] bg-meals/10 text-meals px-2 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {recipe.sourceUrl && (
                      <a
                        href={recipe.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-meals truncate max-w-full"
                        title={recipe.sourceUrl}
                      >
                        <LinkIcon className="w-3 h-3 shrink-0" />
                        <span className="truncate">Source</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Recipe Picker Modal ──────────────────────────────────────── */}
      <Modal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={`${DAYS[pickerDay]} - ${SLOTS.find((s) => s.key === pickerSlot)?.label}`}
      >
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Rechercher une recette..."
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          {filteredRecipes.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              Aucune recette trouvée. Créez-en une dans l&apos;onglet Recettes.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1">
              {filteredRecipes.map((recipe) => (
                <button
                  key={recipe._id}
                  onClick={() => assignRecipe(pickerDay, pickerSlot, recipe._id)}
                  disabled={saving}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between gap-2 disabled:opacity-50"
                >
                  <div>
                    <p className="text-sm font-medium">{recipe.name}</p>
                    <div className="flex gap-2 text-[10px] text-gray-400 mt-0.5">
                      {recipe.prepTime != null && <span>{recipe.prepTime}min prep</span>}
                      {recipe.cookTime != null && <span>{recipe.cookTime}min cuisson</span>}
                      {recipe.servings != null && <span>{recipe.servings} pers.</span>}
                    </div>
                  </div>
                  {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ─── URL Import Modal ─────────────────────────────────────────── */}
      <Modal
        isOpen={showUrlImport}
        onClose={() => !importing && setShowUrlImport(false)}
        title="Importer une recette depuis une URL"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Colle le lien d&apos;une recette (Marmiton, 750g, Cuisine Actuelle,
            Allrecipes, etc.). Nous tentons d&apos;en extraire les ingrédients,
            les étapes et les temps de préparation. Tu pourras corriger avant
            d&apos;enregistrer.
          </p>
          <Input
            label="URL"
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://www.marmiton.org/recettes/..."
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => setShowUrlImport(false)}
              disabled={importing}
            >
              Annuler
            </Button>
            <Button
              onClick={importFromUrl}
              isLoading={importing}
              disabled={!importUrl.trim()}
            >
              Importer
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Recipe Creation Modal ────────────────────────────────────── */}
      <Modal
        isOpen={showRecipeForm}
        onClose={() => setShowRecipeForm(false)}
        title={recipeForm.sourceUrl ? 'Recette importée' : 'Nouvelle recette'}
        size="lg"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {recipeForm.imageUrl && (
            <div className="rounded-lg overflow-hidden">
              <img
                src={recipeForm.imageUrl}
                alt={recipeForm.name}
                className="w-full h-40 object-cover"
                onError={(e) => {
                  // Some sites return image URLs that block hotlinking; hide on error
                  // rather than showing a broken image.
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          {recipeForm.sourceUrl && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <LinkIcon className="w-3 h-3" />
              <a
                href={recipeForm.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:underline"
              >
                {recipeForm.sourceUrl}
              </a>
            </p>
          )}
          <Input
            label="Nom"
            value={recipeForm.name}
            onChange={(e) => setRecipeForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Description"
            value={recipeForm.description}
            onChange={(e) => setRecipeForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Portions"
              type="number"
              value={recipeForm.servings}
              onChange={(e) => setRecipeForm((f) => ({ ...f, servings: e.target.value }))}
            />
            <Input
              label="Prep (min)"
              type="number"
              value={recipeForm.prepTime}
              onChange={(e) => setRecipeForm((f) => ({ ...f, prepTime: e.target.value }))}
            />
            <Input
              label="Cuisson (min)"
              type="number"
              value={recipeForm.cookTime}
              onChange={(e) => setRecipeForm((f) => ({ ...f, cookTime: e.target.value }))}
            />
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Ingrédients
            </label>
            <div className="space-y-2">
              {recipeForm.ingredients.map((ing, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Nom"
                    value={ing.name}
                    onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                  <input
                    type="text"
                    placeholder="Qté"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)}
                    className="w-16 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                  <input
                    type="text"
                    placeholder="Unité"
                    value={ing.unit}
                    onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                    className="w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                  <button
                    onClick={() => removeIngredient(idx)}
                    className="p-1 text-red-400 hover:text-red-600"
                    type="button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addIngredient}
              type="button"
              className="mt-2 text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Ajouter un ingrédient
            </button>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Instructions
            </label>
            <div className="space-y-2">
              {recipeForm.instructions.map((step, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400 w-5 text-right">{idx + 1}.</span>
                  <input
                    type="text"
                    placeholder={`Étape ${idx + 1}`}
                    value={step}
                    onChange={(e) => updateInstruction(idx, e.target.value)}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                  />
                  <button
                    onClick={() => removeInstruction(idx)}
                    className="p-1 text-red-400 hover:text-red-600"
                    type="button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addInstruction}
              type="button"
              className="mt-2 text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Ajouter une étape
            </button>
          </div>

          {/* Tags */}
          <Input
            label="Tags (séparés par des virgules)"
            value={recipeForm.tags}
            onChange={(e) => setRecipeForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="rapide, végétarien, dessert"
          />

          <Button onClick={createRecipe} className="w-full" isLoading={creatingRecipe}>
            Ajouter la recette
          </Button>
        </div>
      </Modal>

      {/* ─── Grocery List Modal ───────────────────────────────────────── */}
      <Modal
        isOpen={groceryOpen}
        onClose={() => setGroceryOpen(false)}
        title="Liste de courses"
        size="lg"
      >
        {groceryList && groceryList.length > 0 ? (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {groceryList.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium capitalize">{item.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {item.fromRecipes.join(', ')}
                  </p>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {item.quantity} {item.unit}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">Aucun ingrédient trouvé.</p>
        )}
      </Modal>
    </div>
  );
}
