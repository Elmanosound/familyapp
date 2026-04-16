export type ListType = 'shopping' | 'todo' | 'inventory' | 'custom';

/** Predefined categories for inventory lists. */
export const INVENTORY_CATEGORIES = [
  // Alimentaire
  'Fruits & Legumes',
  'Viandes & Poissons',
  'Produits laitiers',
  'Epicerie',
  'Boissons',
  'Surgeles',
  // Maison
  'Hygiene',
  'Menage',
  'Autre',
] as const;

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export interface List {
  _id: string;
  familyId: string;
  name: string;
  type: ListType;
  icon?: string;
  color?: string;
  createdBy: string;
  isArchived: boolean;
  sortOrder: number;
  itemCount?: number;
  completedCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListItem {
  _id: string;
  listId: string;
  familyId: string;
  text: string;
  isCompleted: boolean;
  completedBy?: string;
  completedAt?: string;
  category?: string;
  quantity?: number;
  unit?: string;
  assignedTo?: string;
  sortOrder: number;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateListData {
  name: string;
  type: ListType;
  icon?: string;
  color?: string;
}

export interface CreateListItemData {
  text: string;
  category?: string;
  quantity?: number;
  unit?: string;
  assignedTo?: string;
}
