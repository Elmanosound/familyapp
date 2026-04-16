import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package, Plus, Minus, Trash2, ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';
import type { List, ListItem } from '@familyapp/shared';
import { INVENTORY_CATEGORIES } from '@familyapp/shared';
import toast from 'react-hot-toast';

// ── Component ────────────────────────────────────────────────────────────────

export function InventoryPage() {
  const { activeFamily } = useFamilyStore();
  const familyId = activeFamily?._id;

  // The inventory is stored as a single list of type "inventory" per family.
  // On first visit, if none exists we auto-create one so the user doesn't
  // have to think about "creating a list" — the concept here is just
  // "my home inventory".
  const [inventory, setInventory] = useState<List | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Add item form ────────────────────────────────────────────────────────
  const [newItemText, setNewItemText] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<string>(INVENTORY_CATEGORIES[0]);
  const [newItemQuantity, setNewItemQuantity] = useState('1');
  const [newItemUnit, setNewItemUnit] = useState('');

  // ── Collapsible category sections ────────────────────────────────────────
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // ── Delete confirmation ──────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Load or auto-create inventory ────────────────────────────────────────

  const loadInventory = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/families/${familyId}/lists`);
      const lists = data.lists as List[];
      let inv = lists.find((l) => l.type === 'inventory') ?? null;

      if (!inv) {
        // Auto-create a default inventory list
        const { data: created } = await api.post(`/families/${familyId}/lists`, {
          name: 'Inventaire maison',
          type: 'inventory',
        });
        inv = created.list as List;
      }

      setInventory(inv);

      // Fetch items
      const { data: itemsData } = await api.get(`/families/${familyId}/lists/${inv!._id}`);
      setItems(itemsData.items);
    } catch {
      toast.error("Erreur lors du chargement de l'inventaire");
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  // ── Item actions ─────────────────────────────────────────────────────────

  const addItem = async () => {
    if (!familyId || !inventory || !newItemText.trim()) return;
    try {
      await api.post(`/families/${familyId}/lists/${inventory._id}/items`, {
        text: newItemText.trim(),
        category: newItemCategory,
        quantity: parseFloat(newItemQuantity) || 1,
        unit: newItemUnit.trim() || undefined,
      });
      setNewItemText('');
      setNewItemQuantity('1');
      setNewItemUnit('');
      // Refresh
      const { data } = await api.get(`/families/${familyId}/lists/${inventory._id}`);
      setItems(data.items);
    } catch {
      toast.error("Erreur lors de l'ajout");
    }
  };

  const updateItemQuantity = async (item: ListItem, delta: number) => {
    if (!familyId || !inventory) return;
    const newQty = Math.max(0, (item.quantity ?? 0) + delta);
    try {
      if (newQty === 0) {
        await api.delete(`/families/${familyId}/lists/${inventory._id}/items/${item._id}`);
      } else {
        await api.patch(`/families/${familyId}/lists/${inventory._id}/items/${item._id}`, {
          quantity: newQty,
        });
      }
      const { data } = await api.get(`/families/${familyId}/lists/${inventory._id}`);
      setItems(data.items);
    } catch {
      toast.error('Erreur lors de la modification');
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!familyId || !inventory) return;
    try {
      await api.delete(`/families/${familyId}/lists/${inventory._id}/items/${itemId}`);
      const { data } = await api.get(`/families/${familyId}/lists/${inventory._id}`);
      setItems(data.items);
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const clearAll = async () => {
    if (!familyId || !inventory) return;
    try {
      // Delete all items by deleting and recreating the list
      await api.delete(`/families/${familyId}/lists/${inventory._id}`);
      const { data: created } = await api.post(`/families/${familyId}/lists`, {
        name: 'Inventaire maison',
        type: 'inventory',
      });
      setInventory(created.list as List);
      setItems([]);
      setShowDeleteConfirm(false);
      toast.success('Inventaire vide');
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  // ── Group items by category ──────────────────────────────────────────────

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ListItem[]>();
    for (const item of items) {
      const cat = item.category || 'Autre';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    // Sort in INVENTORY_CATEGORIES order
    const ordered: [string, ListItem[]][] = [];
    for (const cat of INVENTORY_CATEGORIES) {
      if (groups.has(cat)) {
        ordered.push([cat, groups.get(cat)!]);
        groups.delete(cat);
      }
    }
    for (const [cat, catItems] of groups) {
      ordered.push([cat, catItems]);
    }
    return ordered;
  }, [items]);

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
        icon={<Package className="w-12 h-12" />}
        title="Aucune famille active"
        description="Selectionnez ou creez une famille pour acceder a l'inventaire."
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Inventaire maison</h2>
        {items.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="w-4 h-4 mr-1" /> Tout vider
          </Button>
        )}
      </div>

      {/* ─── Add product form ───────────────────────────────────────────── */}
      <div className="card p-4 mb-6">
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
          <Button onClick={addItem} size="sm" className="shrink-0" disabled={!newItemText.trim()}>
            <Plus className="w-4 h-4 mr-1" /> Ajouter
          </Button>
        </div>
      </div>

      {/* ─── Grouped items by category ──────────────────────────────────── */}
      {groupedItems.length > 0 ? (
        <div className="space-y-4">
          {groupedItems.map(([category, catItems]) => {
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
                        <span className="flex-1 text-sm font-medium">{item.text}</span>
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
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Package className="w-12 h-12" />}
          title="Inventaire vide"
          description="Ajoutez des produits avec le formulaire ci-dessus pour suivre votre stock maison"
        />
      )}

      {/* ─── Clear all confirmation ─────────────────────────────────────── */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Vider l'inventaire"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Es-tu sur de vouloir supprimer tous les produits de l&apos;inventaire ? Cette action est irreversible.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
              Annuler
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={clearAll}
            >
              Tout supprimer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
