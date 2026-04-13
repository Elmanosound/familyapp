import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError } from '../utils/errors.js';

export async function getRecipes(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const { search, tags } = req.query;

    const where: Record<string, unknown> = { familyId };
    if (search) {
      where.name = { contains: search as string };
    }
    if (tags) {
      where.tags = { contains: (tags as string).split(',')[0] };
    }

    const recipes = await prisma.recipe.findMany({
      where,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ recipes });
  } catch (error) {
    next(error);
  }
}

export async function createRecipe(req: Request, res: Response, next: NextFunction) {
  try {
    const recipe = await prisma.recipe.create({
      data: {
        name: req.body.name,
        description: req.body.description,
        imageUrl: req.body.imageUrl,
        servings: req.body.servings,
        prepTime: req.body.prepTime,
        cookTime: req.body.cookTime,
        ingredients: JSON.stringify(req.body.ingredients || []),
        instructions: JSON.stringify(req.body.instructions || []),
        tags: JSON.stringify(req.body.tags || []),
        sourceUrl: req.body.sourceUrl,
        familyId: (req.params.familyId as string),
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ recipe });
  } catch (error) {
    next(error);
  }
}

export async function getRecipe(req: Request, res: Response, next: NextFunction) {
  try {
    const recipe = await prisma.recipe.findUnique({
      where: { id: (req.params.recipeId as string) },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!recipe) throw new NotFoundError('Recipe');
    res.json({ recipe });
  } catch (error) {
    next(error);
  }
}

export async function updateRecipe(req: Request, res: Response, next: NextFunction) {
  try {
    const recipe = await prisma.recipe.update({
      where: { id: (req.params.recipeId as string) },
      data: req.body,
    });
    res.json({ recipe });
  } catch (error) {
    next(error);
  }
}

export async function deleteRecipe(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.recipe.delete({ where: { id: (req.params.recipeId as string) } });
    res.json({ message: 'Recipe deleted' });
  } catch (error) {
    next(error);
  }
}

export async function getMealPlans(req: Request, res: Response, next: NextFunction) {
  try {
    const { weekStartDate } = req.query;
    const where: Record<string, unknown> = { familyId: (req.params.familyId as string) };
    if (weekStartDate) {
      where.weekStartDate = new Date(weekStartDate as string);
    }

    const plans = await prisma.mealPlan.findMany({
      where,
      include: {
        meals: {
          include: {
            recipe: { select: { id: true, name: true, imageUrl: true, prepTime: true, cookTime: true } },
          },
        },
      },
      orderBy: { weekStartDate: 'desc' },
    });

    res.json({ plans });
  } catch (error) {
    next(error);
  }
}

export async function createOrUpdateMealPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const { weekStartDate, meals } = req.body;
    const familyId = req.params.familyId as string;
    const weekStart = new Date(weekStartDate);

    const existing = await prisma.mealPlan.findUnique({
      where: { familyId_weekStartDate: { familyId, weekStartDate: weekStart } },
    });

    let plan;
    if (existing) {
      await prisma.mealSlot.deleteMany({ where: { mealPlanId: existing.id } });
      plan = await prisma.mealPlan.update({
        where: { id: existing.id },
        data: {
          createdById: req.user!.id,
          meals: { create: meals },
        },
        include: {
          meals: {
            include: {
              recipe: { select: { id: true, name: true, imageUrl: true, prepTime: true, cookTime: true } },
            },
          },
        },
      });
    } else {
      plan = await prisma.mealPlan.create({
        data: {
          familyId,
          weekStartDate: weekStart,
          createdById: req.user!.id,
          meals: { create: meals },
        },
        include: {
          meals: {
            include: {
              recipe: { select: { id: true, name: true, imageUrl: true, prepTime: true, cookTime: true } },
            },
          },
        },
      });
    }

    res.json({ plan });
  } catch (error) {
    next(error);
  }
}

export async function generateGroceryList(req: Request, res: Response, next: NextFunction) {
  try {
    const plan = await prisma.mealPlan.findUnique({
      where: { id: (req.params.planId as string) },
      include: {
        meals: { include: { recipe: true } },
      },
    });
    if (!plan) throw new NotFoundError('Meal plan');

    const ingredientMap = new Map<string, { quantity: number; unit: string; fromRecipes: string[] }>();

    const planWithMeals = plan as typeof plan & { meals: Array<{ recipe: { name: string; ingredients: unknown } | null }> };
    for (const meal of planWithMeals.meals) {
      const recipe = meal.recipe;
      if (!recipe) continue;

      const ingredients = (typeof recipe.ingredients === 'string'
        ? JSON.parse(recipe.ingredients)
        : recipe.ingredients) as { name: string; quantity: number; unit: string }[];
      if (!ingredients) continue;

      for (const ing of ingredients) {
        const key = `${ing.name.toLowerCase()}-${ing.unit}`;
        const existing = ingredientMap.get(key);
        if (existing) {
          existing.quantity += ing.quantity;
          existing.fromRecipes.push(recipe.name);
        } else {
          ingredientMap.set(key, {
            quantity: ing.quantity,
            unit: ing.unit,
            fromRecipes: [recipe.name],
          });
        }
      }
    }

    const groceryList = Array.from(ingredientMap.entries()).map(([key, val]) => ({
      name: key.split('-')[0],
      ...val,
    }));

    res.json({ groceryList });
  } catch (error) {
    next(error);
  }
}
