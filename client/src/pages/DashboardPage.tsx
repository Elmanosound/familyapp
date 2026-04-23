import { useEffect, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, ListTodo, MessageCircle, Image,
  MapPin, Wallet, UtensilsCrossed, ChevronRight, Users,
  Package, AlertTriangle,
} from 'lucide-react';
import { useFamilyStore } from '../stores/familyStore';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import api from '../config/api';
import type { ListItem, List } from '@familyapp/shared';

const modules = [
  { to: '/calendar',  icon: Calendar,       label: 'Calendrier',  color: 'bg-calendar/10 text-calendar',    desc: 'Événements et rendez-vous' },
  { to: '/lists',     icon: ListTodo,        label: 'Listes',      color: 'bg-lists/10 text-lists',           desc: 'Courses et tâches' },
  { to: '/inventory', icon: Package,         label: 'Inventaire',  color: 'bg-emerald-50 text-emerald-600',   desc: 'Stock maison' },
  { to: '/chat',      icon: MessageCircle,   label: 'Messagerie',  color: 'bg-chat/10 text-chat',             desc: 'Discussions familiales' },
  { to: '/media',     icon: Image,           label: 'Photos',      color: 'bg-media/10 text-media',           desc: 'Albums et souvenirs' },
  { to: '/location',  icon: MapPin,          label: 'Localisation', color: 'bg-location/10 text-location',   desc: 'Carte de la famille' },
  { to: '/budget',    icon: Wallet,          label: 'Budget',      color: 'bg-budget/10 text-budget',         desc: 'Dépenses et objectifs' },
  { to: '/meals',     icon: UtensilsCrossed, label: 'Repas',       color: 'bg-meals/10 text-meals',           desc: 'Menu de la semaine' },
];

export function DashboardPage() {
  const { user } = useAuthStore();
  const { activeFamily, families, fetchFamilies, createFamily } = useFamilyStore();
  const familyId = activeFamily?._id;

  const [showCreate, setShowCreate] = useState(false);
  const [familyName, setFamilyName] = useState('');

  // ── Inventory widget state ────────────────────────────────────────────────
  const [inventoryItems, setInventoryItems] = useState<ListItem[]>([]);

  useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  // Fetch inventory on mount (read-only, no auto-create)
  const fetchInventory = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data } = await api.get(`/families/${familyId}/lists`);
      const inv = (data.lists as List[]).find((l) => l.type === 'inventory');
      if (!inv) return;
      const { data: detail } = await api.get(`/families/${familyId}/lists/${inv._id}`);
      setInventoryItems(detail.items as ListItem[]);
    } catch { /* silent — widget is optional */ }
  }, [familyId]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Low-stock items: quantity ≤ 1
  const lowStockItems = useMemo(
    () => inventoryItems.filter((i) => (i.quantity ?? 0) <= 1),
    [inventoryItems],
  );

  // Category breakdown: [category, count][] sorted by count desc, top 6
  const categoryGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of inventoryItems) {
      const cat = item.category || 'Autre';
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [inventoryItems]);

  const handleCreateFamily = async () => {
    if (!familyName.trim()) return;
    await createFamily({ name: familyName, type: 'family' });
    setFamilyName('');
    setShowCreate(false);
  };

  // ── No family yet ─────────────────────────────────────────────────────────
  if (families.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-primary-100 rounded-full mb-6">
          <Users className="w-10 h-10 text-primary-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Bienvenue sur FamilyApp, {user?.firstName} !</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
          Commencez par créer votre groupe familial pour inviter vos proches et organiser votre vie ensemble.
        </p>
        <Button onClick={() => setShowCreate(true)} size="lg">Créer ma famille</Button>
        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Créer un groupe">
          <div className="space-y-4">
            <Input label="Nom du groupe" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="Famille Dupont" />
            <Button onClick={handleCreateFamily} className="w-full">Créer</Button>
          </div>
        </Modal>
      </div>
    );
  }

  // ── Main dashboard ────────────────────────────────────────────────────────
  return (
    <div>
      {/* Greeting */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Bonjour, {user?.firstName} !</h2>
        <p className="text-gray-600 dark:text-gray-400">{activeFamily?.name}</p>
      </div>

      {/* Members */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Membres</h3>
          <Link to="/family/settings" className="text-sm text-primary-600 hover:underline">Gérer</Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {activeFamily?.members.map((m) => {
            const member = m.user as unknown as { _id: string; firstName: string; lastName: string };
            return (
              <div key={member._id || String(m.user)} className="flex flex-col items-center min-w-[60px]">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: m.color }}
                >
                  {(member.firstName?.[0] || '?')}{(member.lastName?.[0] || '')}
                </div>
                <span className="text-xs mt-1 truncate w-16 text-center">{member.firstName || 'Membre'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {modules.map(({ to, icon: Icon, label, color, desc }) => (
          <Link key={to} to={to} className="card p-4 hover:shadow-md transition-shadow group">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm">{label}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
            </div>
          </Link>
        ))}
      </div>

      {/* ── Inventory widget ──────────────────────────────────────────────── */}
      {inventoryItems.length > 0 && (
        <div className="card p-4 mt-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <Package className="w-4 h-4 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-sm">Inventaire maison</h3>
            </div>
            <Link
              to="/inventory"
              className="flex items-center gap-0.5 text-xs text-emerald-600 hover:underline"
            >
              Voir tout <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Low-stock alert */}
          {lowStockItems.length > 0 && (
            <div className="flex items-start gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs">
                <span className="font-semibold text-orange-700 dark:text-orange-400">
                  Faible stock ({lowStockItems.length}) :{' '}
                </span>
                <span className="text-orange-600 dark:text-orange-300">
                  {lowStockItems.slice(0, 3).map((i) => i.text).join(', ')}
                  {lowStockItems.length > 3 && ` +${lowStockItems.length - 3} autres`}
                </span>
              </p>
            </div>
          )}

          {/* Category grid */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {categoryGroups.map(([cat, count]) => (
              <div
                key={cat}
                className="bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-2 text-center"
              >
                <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{count}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={cat}>{cat}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 text-right mt-2">
            {inventoryItems.length} produit{inventoryItems.length > 1 ? 's' : ''} au total
          </p>
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Créer un groupe">
        <div className="space-y-4">
          <Input label="Nom du groupe" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="Famille Dupont" />
          <Button onClick={handleCreateFamily} className="w-full">Créer</Button>
        </div>
      </Modal>
    </div>
  );
}
