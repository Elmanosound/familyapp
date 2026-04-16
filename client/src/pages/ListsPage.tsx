import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ListTodo, Plus, Check, Trash2, ShoppingCart, CheckSquare,
  Package, Minus, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';
import type { List, ListItem, ListType } from '@familyapp/shared';
import { INVENTORY_CATEGORIES } from '@familyapp/shared';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

const LIST_TYPE_META: Record<string, { icon: typeof ShoppingCart; label: string; color: string }> = {
  shopping: { icon: ShoppingCart, label: 'Courses', color: 'text-orange-500' },
  todo: { icon: CheckSquare, label: 'Taches', color: 'text-lists' },
  inventory: { icon: Package, label: 'Inventaire', color: 'text-emerald-500' },
  custom: { icon: ListTodo, label: 'Personnalisee', color: 'text-lists' },
};

function listIcon(type: string) {
  const meta = LIST_TYPE_META[type] ?? LIST_TYPE_META.custom;
  const Icon = meta.icon;
  return <Icon className={clsx('w-5 h-5', meta.color)} />;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ListsPage() {
  const { activeFamily } = useFamilyStore();
  const familyId = activeFamily?._id;

  // ── List-of-lists state ──────────────────────────────────────────────────
  const [lists, setLists] = useState<(List & { itemCount: number; completedCount: number })[]>([]);
  const [selectedList, setSelectedList] = useState<List | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);

  // ── Create list modal ────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [listName, setListName] = useState('');
  const [listType, setListType] = useState<ListType>('todo');

  // ── Add item state ───────────────────────────────────────────────────────
  const [newItemText, setNewItemText] = useState('');
  // Inventory-specific fields for adding items
  const [newItemCategory, setNewItemCategory] = useState<string>(INVENTORY_CATEGORIES[0]);
  const [newItemQuantity, setNewItemQuantity] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('');

  // ── Collapsible category sections (inventory view) ───────────────────────
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // ── Delete list confirmation ─────────────────────────────────────────────
  const [deletingListId, setDeletingListId] = useState<string | null>(null);

  const isInventory = selectedList?.type === 'inventory';

  // ── API helpers ──────────────────────────────────────────────────────────

  const fetchLists = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data } = await api.get(`/families/${familyId}/lists`);
      setLists(data.lists);
    } catch {
      toast.error('Erreur lors du chargement des listes');
    }
  }, [familyId]);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const fetchItems = async (list: List) => {
    if (!familyId) return;
    setSelectedList(list);
    try {
      const { data } = await api.get(`/families/${familyId}/lists/${list._id}`);
      setItems(data.items);
    } catch {
      toast.error('Erreur lors du chargement des elements');
    }
  };

  const createList = async () => {
    if (!familyId || !listName) return;
    try {
      await api.post(`/families/${familyId}/lists`, { name: listName, type: listType });
      setShowCreate(false);
      setListName('');
      fetchLists();
      toast.success('Liste creee');
    } catch {
      toast.error('Erreur lors de la creation');
    }
  };

  const deleteList = async (listId: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/lists/${listId}`);
      setDeletingListId(null);
      if (selectedList?._id === listId) {
        setSelectedList(null);
        setItems([]);
      }
      fetchLists();
      toast.success('Liste supprimee');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const addItem = async () => {
    if (!familyId || !selectedList || !newItemText.trim()) return;
    try {
      const payload: Record<string, unknown> = { text: newItemText.trim() };
      if (isInventory) {
        payload.category = newItemCategory;
        payload.quantity = parseFloat(newItemQuantity) || 1;
        if (newItemUnit.trim()) payload.unit = newItemUnit.trim();
      }
      await api.post(`/families/${familyId}/lists/${selectedList._id}/items`, payload);
      setNewItemText('');
      setNewItemQuantity('1');
      setNewItemUnit('');
      fetchItems(selectedList);
    } catch {
      toast.error("Erreur lors de l'ajout");
    }
  };

  const toggleItem = async (item: ListItem) => {
    if (!familyId || !selectedList) return;
    try {
      await api.patch(`/families/${familyId}/lists/${selectedList._id}/items/${item._id}`, {
        isCompleted: !item.isCompleted,
      });
      fetchItems(selectedList);
    } catch {
      toast.error('Erreur lors de la modification');
    }
  };

  const updateItemQuantity = async (item: ListItem, delta: number) => {
    if (!familyId || !selectedList) return;
    const newQty = Math.max(0, (item.quantity ?? 0) + delta);
    try {
      if (newQty === 0) {
        await api.delete(`/families/${familyId}/lists/${selectedList._id}/items/${item._id}`);
      } else {
        await api.patch(`/families/${familyId}/lists/${selectedList._id}/items/${item._id}`, {
          quantity: newQty,
        });
      }
      fetchItems(selectedList);
    } catch {
      toast.error('Erreur lors de la modification');
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!familyId || !selectedList) return;
    try {
      await api.delete(`/families/${familyId}/lists/${selectedList._id}/items/${itemId}`);
      fetchItems(selectedList);
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  // ── Group items by category for inventory view ───────────────────────────

  const groupedItems = useMemo(() => {
    if (!isInventory) return null;
    const groups = new Map<string, ListItem[]>();
    for (const item of items) {
      const cat = item.category || 'Autre';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    // Sort categories in INVENTORY_CATEGORIES order
    const ordered: [string, ListItem[]][] = [];
    for (const cat of INVENTORY_CATEGORIES) {
      if (groups.has(cat)) {
        ordered.push([cat, groups.get(cat)!]);
        groups.delete(cat);
      }
    }
    // Append any remaining categories not in the predefined list
    for (const [cat, catItems] of groups) {
      ordered.push([cat, catItems]);
    }
    return ordered;
  }, [items, isInventory]);

  const toggleCategory = (cat: string) =>
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  // ── Render ─────────────────────────────────────────────────────────────

  if (!familyId) {
    return (
      <EmptyState
        icon={<ListTodo className="w-12 h-12" />}
        title="Aucune famille active"
        description="Selectionnez ou creez une famille pour acceder aux listes."
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          {selectedList ? selectedList.name : 'Listes'}
        </h2>
        <div className="flex gap-2">
          {selectedList && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedList(null);
                setItems([]);
                fetchLists();
              }}
            >
              Retour
            </Button>
          )}
          {!selectedList && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> Liste
            </Button>
          )}
        </div>
      </div>

      {/* ─── List-of-lists grid ─────────────────────────────────────────── */}
      {!selectedList && (
        lists.length === 0 ? (
          <EmptyState
            icon={<ListTodo className="w-12 h-12" />}
            title="Aucune liste"
            description="Creez une liste de courses, de taches ou un inventaire maison"
            action={
              <Button onClick={() => setShowCreate(true)} size="sm">
                Creer une liste
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((list) => (
              <div key={list._id} className="card p-4 hover:shadow-md transition-shadow relative group">
                <button
                  onClick={() => fetchItems(list)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-3 mb-2">
                    {listIcon(list.type)}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{list.name}</h3>
                      <span className="text-[10px] text-gray-400 uppercase">
                        {LIST_TYPE_META[list.type]?.label ?? list.type}
                      </span>
                    </div>
                  </div>
                  {list.type !== 'inventory' ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-lists h-2 rounded-full transition-all"
                          style={{
                            width: list.itemCount
                              ? `${(list.completedCount / list.itemCount) * 100}%`
                              : '0%',
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">
                        {list.completedCount}/{list.itemCount}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {list.itemCount} produit{list.itemCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </button>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingListId(list._id);
                  }}
                  className="absolute top-3 right-3 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Supprimer la liste"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* ─── Standard list view (shopping / todo) ───────────────────────── */}
      {selectedList && !isInventory && (
        <div className="card">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex gap-2">
            <Input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Ajouter un element..."
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
            />
            <Button onClick={addItem} size="sm">
              Ajouter
            </Button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((item) => (
              <div
                key={item._id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <button
                  onClick={() => toggleItem(item)}
                  className={clsx(
                    'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                    item.isCompleted
                      ? 'bg-lists border-lists text-white'
                      : 'border-gray-300',
                  )}
                >
                  {item.isCompleted && <Check className="w-3 h-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <span
                    className={clsx(
                      'text-sm',
                      item.isCompleted && 'line-through text-gray-400',
                    )}
                  >
                    {item.text}
                  </span>
                  {(item.quantity != null || item.unit) && (
                    <span className="ml-2 text-xs text-gray-400">
                      {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                    </span>
                  )}
                </div>
                {item.category && (
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded whitespace-nowrap">
                    {item.category}
                  </span>
                )}
                <button
                  onClick={() => deleteItem(item._id)}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {items.length === 0 && (
              <div className="p-8 text-center text-gray-500">Liste vide</div>
            )}
          </div>
        </div>
      )}

      {/* ─── Inventory view ─────────────────────────────────────────────── */}
      {selectedList && isInventory && (
        <div className="space-y-4">
          {/* Add inventory item — form with category, quantity, unit */}
          <div className="card p-4">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[140px]">
                <Input
                  label="Produit"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  placeholder="Nom du produit..."
                  onKeyDown={(e) => e.key === 'Enter' && addItem()}
                />
              </div>
              <div className="w-24">
                <Input
                  label="Qte"
                  type="number"
                  value={newItemQuantity}
                  onChange={(e) => setNewItemQuantity(e.target.value)}
                  min="0"
                />
              </div>
              <div className="w-24">
                <Input
                  label="Unite"
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  placeholder="g, L, pcs"
                />
              </div>
              <div className="w-44">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Categorie
                </label>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {INVENTORY_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={addItem} size="sm" className="shrink-0">
                <Plus className="w-4 h-4 mr-1" /> Ajouter
              </Button>
            </div>
          </div>

          {/* Grouped items by category */}
          {groupedItems && groupedItems.length > 0 ? (
            groupedItems.map(([category, catItems]) => {
              const collapsed = collapsedCategories.has(category);
              return (
                <div key={category} className="card overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                  >
                    {collapsed ? (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-sm font-semibold">{category}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {catItems.length} produit{catItems.length !== 1 ? 's' : ''}
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {catItems.map((item) => (
                        <div
                          key={item._id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <span className="flex-1 text-sm font-medium">
                            {item.text}
                          </span>
                          {/* Quantity controls */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateItemQuantity(item, -1)}
                              className="p-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-sm font-medium min-w-[40px] text-center">
                              {item.quantity ?? 0}
                              {item.unit ? (
                                <span className="text-xs text-gray-400 ml-0.5">{item.unit}</span>
                              ) : null}
                            </span>
                            <button
                              onClick={() => updateItemQuantity(item, 1)}
                              className="p-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button
                            onClick={() => deleteItem(item._id)}
                            className="p-1 text-gray-300 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="card p-8 text-center text-gray-500">
              Inventaire vide — ajoutez des produits ci-dessus
            </div>
          )}
        </div>
      )}

      {/* ─── Create list modal ──────────────────────────────────────────── */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nouvelle liste"
      >
        <div className="space-y-4">
          <Input
            label="Nom"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            required
          />
          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <div className="flex gap-2">
              {(
                [
                  { key: 'todo', label: 'Taches', icon: CheckSquare },
                  { key: 'shopping', label: 'Courses', icon: ShoppingCart },
                  { key: 'inventory', label: 'Inventaire', icon: Package },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setListType(key)}
                  className={clsx(
                    'flex-1 p-3 rounded-lg border text-sm flex flex-col items-center gap-1 transition-colors',
                    listType === key
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700',
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={createList} className="w-full" disabled={!listName.trim()}>
            Creer
          </Button>
        </div>
      </Modal>

      {/* ─── Delete list confirmation modal ─────────────────────────────── */}
      <Modal
        isOpen={!!deletingListId}
        onClose={() => setDeletingListId(null)}
        title="Supprimer la liste"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Es-tu sur de vouloir supprimer cette liste et tous ses elements ? Cette action est irreversible.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeletingListId(null)}>
              Annuler
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deletingListId && deleteList(deletingListId)}
            >
              Supprimer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
