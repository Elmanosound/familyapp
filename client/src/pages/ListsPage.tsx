import { useState, useEffect, useCallback } from 'react';
import { ListTodo, Plus, Check, Trash2, ShoppingCart, CheckSquare } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';
import type { List, ListItem } from '@familyapp/shared';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

export function ListsPage() {
  const { activeFamily } = useFamilyStore();
  const [lists, setLists] = useState<(List & { itemCount: number; completedCount: number })[]>([]);
  const [selectedList, setSelectedList] = useState<List | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [listName, setListName] = useState('');
  const [listType, setListType] = useState<'shopping' | 'todo'>('todo');
  const [newItemText, setNewItemText] = useState('');

  const fetchLists = useCallback(async () => {
    if (!activeFamily) return;
    const { data } = await api.get(`/families/${activeFamily._id}/lists`);
    setLists(data.lists);
  }, [activeFamily]);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const fetchItems = async (list: List) => {
    if (!activeFamily) return;
    setSelectedList(list);
    const { data } = await api.get(`/families/${activeFamily._id}/lists/${list._id}`);
    setItems(data.items);
  };

  const createList = async () => {
    if (!activeFamily || !listName) return;
    await api.post(`/families/${activeFamily._id}/lists`, { name: listName, type: listType });
    setShowCreate(false);
    setListName('');
    fetchLists();
    toast.success('Liste creee');
  };

  const addItem = async () => {
    if (!activeFamily || !selectedList || !newItemText) return;
    await api.post(`/families/${activeFamily._id}/lists/${selectedList._id}/items`, { text: newItemText });
    setNewItemText('');
    fetchItems(selectedList);
  };

  const toggleItem = async (item: ListItem) => {
    if (!activeFamily || !selectedList) return;
    await api.patch(`/families/${activeFamily._id}/lists/${selectedList._id}/items/${item._id}`, {
      isCompleted: !item.isCompleted,
    });
    fetchItems(selectedList);
  };

  const deleteItem = async (itemId: string) => {
    if (!activeFamily || !selectedList) return;
    await api.delete(`/families/${activeFamily._id}/lists/${selectedList._id}/items/${itemId}`);
    fetchItems(selectedList);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">{selectedList ? selectedList.name : 'Listes'}</h2>
        <div className="flex gap-2">
          {selectedList && (
            <Button variant="secondary" size="sm" onClick={() => { setSelectedList(null); setItems([]); }}>
              Retour
            </Button>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Liste
          </Button>
        </div>
      </div>

      {!selectedList ? (
        lists.length === 0 ? (
          <EmptyState
            icon={<ListTodo className="w-12 h-12" />}
            title="Aucune liste"
            description="Creez une liste de courses ou de taches"
            action={<Button onClick={() => setShowCreate(true)} size="sm">Creer une liste</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((list) => (
              <button
                key={list._id}
                onClick={() => fetchItems(list)}
                className="card p-4 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 mb-2">
                  {list.type === 'shopping' ? (
                    <ShoppingCart className="w-5 h-5 text-lists" />
                  ) : (
                    <CheckSquare className="w-5 h-5 text-lists" />
                  )}
                  <h3 className="font-medium">{list.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-lists h-2 rounded-full transition-all"
                      style={{ width: list.itemCount ? `${(list.completedCount / list.itemCount) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{list.completedCount}/{list.itemCount}</span>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="card">
          {/* Add item */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex gap-2">
            <Input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Ajouter un element..."
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
            />
            <Button onClick={addItem} size="sm">Ajouter</Button>
          </div>
          {/* Items */}
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((item) => (
              <div key={item._id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                <button onClick={() => toggleItem(item)} className={clsx(
                  'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                  item.isCompleted ? 'bg-lists border-lists text-white' : 'border-gray-300'
                )}>
                  {item.isCompleted && <Check className="w-3 h-3" />}
                </button>
                <span className={clsx('flex-1 text-sm', item.isCompleted && 'line-through text-gray-400')}>
                  {item.text}
                </span>
                {item.category && (
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{item.category}</span>
                )}
                <button onClick={() => deleteItem(item._id)} className="p-1 text-gray-400 hover:text-red-500">
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

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nouvelle liste">
        <div className="space-y-4">
          <Input label="Nom" value={listName} onChange={(e) => setListName(e.target.value)} required />
          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setListType('todo')}
                className={clsx('flex-1 p-3 rounded-lg border text-sm', listType === 'todo' ? 'border-primary-500 bg-primary-50' : 'border-gray-200')}
              >
                Taches
              </button>
              <button
                onClick={() => setListType('shopping')}
                className={clsx('flex-1 p-3 rounded-lg border text-sm', listType === 'shopping' ? 'border-primary-500 bg-primary-50' : 'border-gray-200')}
              >
                Courses
              </button>
            </div>
          </div>
          <Button onClick={createList} className="w-full">Creer</Button>
        </div>
      </Modal>
    </div>
  );
}
