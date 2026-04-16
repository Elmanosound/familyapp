import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ListTodo, Plus, Check, Trash2, ShoppingCart, CheckSquare, Package,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';
import type { List, ListItem, ListType } from '@familyapp/shared';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

const LIST_TYPE_META: Record<string, { icon: typeof ShoppingCart; label: string; color: string }> = {
  shopping: { icon: ShoppingCart, label: 'Courses', color: 'text-orange-500' },
  todo: { icon: CheckSquare, label: 'Taches', color: 'text-lists' },
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

  // ── Delete list confirmation ─────────────────────────────────────────────
  const [deletingListId, setDeletingListId] = useState<string | null>(null);

  // ── Transfer to inventory ────────────────────────────────────────────────
  const [transferring, setTransferring] = useState(false);

  // ── API helpers ──────────────────────────────────────────────────────────

  const fetchLists = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data } = await api.get(`/families/${familyId}/lists`);
      // Filter out inventory lists — they live on their own page now.
      setLists((data.lists as (List & { itemCount: number; completedCount: number })[]).filter(
        (l) => l.type !== 'inventory',
      ));
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
      await api.post(`/families/${familyId}/lists/${selectedList._id}/items`, {
        text: newItemText.trim(),
      });
      setNewItemText('');
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

  const deleteItem = async (itemId: string) => {
    if (!familyId || !selectedList) return;
    try {
      await api.delete(`/families/${familyId}/lists/${selectedList._id}/items/${itemId}`);
      fetchItems(selectedList);
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  // ── Derived: can we transfer to inventory? ─────────────────────────────

  const isShopping = selectedList?.type === 'shopping';
  const completedCount = useMemo(
    () => items.filter((i) => i.isCompleted).length,
    [items],
  );

  const transferToInventory = async () => {
    if (!familyId || !selectedList) return;
    setTransferring(true);
    try {
      const { data } = await api.post<{ transferredCount: number }>(
        `/families/${familyId}/lists/${selectedList._id}/to-inventory`,
      );
      toast.success(`${data.transferredCount} produit${data.transferredCount > 1 ? 's' : ''} ajoute${data.transferredCount > 1 ? 's' : ''} a l'inventaire`);
      fetchItems(selectedList);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Erreur lors du transfert vers l'inventaire";
      toast.error(msg);
    } finally {
      setTransferring(false);
    }
  };

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
            description="Creez une liste de courses ou de taches"
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

      {/* ─── List items view ────────────────────────────────────────────── */}
      {selectedList && (
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
          {/* Transfer to inventory button — only for shopping lists with checked items */}
          {isShopping && completedCount > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <Button
                onClick={transferToInventory}
                isLoading={transferring}
                className="w-full"
                variant="secondary"
              >
                <Package className="w-4 h-4 mr-2" />
                Ajouter {completedCount} produit{completedCount > 1 ? 's' : ''} coche{completedCount > 1 ? 's' : ''} a l&apos;inventaire
              </Button>
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
