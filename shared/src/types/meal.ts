export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

export interface Recipe {
  _id: string;
  familyId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  servings: number;
  prepTime?: number;
  cookTime?: number;
  ingredients: Ingredient[];
  instructions: string[];
  tags: string[];
  sourceUrl?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealSlot {
  dayOfWeek: number;
  mealType: MealType;
  recipe?: string;
  customMealName?: string;
  notes?: string;
}

export interface MealPlan {
  _id: string;
  familyId: string;
  weekStartDate: string;
  meals: MealSlot[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecipeData {
  name: string;
  description?: string;
  servings: number;
  prepTime?: number;
  cookTime?: number;
  ingredients: Ingredient[];
  instructions: string[];
  tags?: string[];
  sourceUrl?: string;
}

export interface GroceryItem {
  name: string;
  quantity: number;
  unit: string;
  fromRecipes: string[];
}
