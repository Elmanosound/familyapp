export type ListType = 'shopping' | 'todo' | 'custom';

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
