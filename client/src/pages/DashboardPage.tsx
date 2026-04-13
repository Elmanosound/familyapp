import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, ListTodo, MessageCircle, Image,
  MapPin, Wallet, UtensilsCrossed, ChevronRight, Users,
} from 'lucide-react';
import { useFamilyStore } from '../stores/familyStore';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { useState } from 'react';

const modules = [
  { to: '/calendar', icon: Calendar, label: 'Calendrier', color: 'bg-calendar/10 text-calendar', desc: 'Evenements et rendez-vous' },
  { to: '/lists', icon: ListTodo, label: 'Listes', color: 'bg-lists/10 text-lists', desc: 'Courses et taches' },
  { to: '/chat', icon: MessageCircle, label: 'Messagerie', color: 'bg-chat/10 text-chat', desc: 'Discussions familiales' },
  { to: '/media', icon: Image, label: 'Photos', color: 'bg-media/10 text-media', desc: 'Albums et souvenirs' },
  { to: '/location', icon: MapPin, label: 'Localisation', color: 'bg-location/10 text-location', desc: 'Carte de la famille' },
  { to: '/budget', icon: Wallet, label: 'Budget', color: 'bg-budget/10 text-budget', desc: 'Depenses et objectifs' },
  { to: '/meals', icon: UtensilsCrossed, label: 'Repas', color: 'bg-meals/10 text-meals', desc: 'Menu de la semaine' },
];

export function DashboardPage() {
  const { user } = useAuthStore();
  const { activeFamily, families, fetchFamilies, createFamily } = useFamilyStore();
  const [showCreate, setShowCreate] = useState(false);
  const [familyName, setFamilyName] = useState('');

  useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  const handleCreateFamily = async () => {
    if (!familyName.trim()) return;
    await createFamily({ name: familyName, type: 'family' });
    setFamilyName('');
    setShowCreate(false);
  };

  // Show create family prompt if user has no family
  if (families.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-primary-100 rounded-full mb-6">
          <Users className="w-10 h-10 text-primary-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Bienvenue sur FamilyApp, {user?.firstName} !</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
          Commencez par creer votre groupe familial pour inviter vos proches et organiser votre vie ensemble.
        </p>
        <Button onClick={() => setShowCreate(true)} size="lg">
          Creer ma famille
        </Button>
        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Creer un groupe">
          <div className="space-y-4">
            <Input
              label="Nom du groupe"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Famille Dupont"
            />
            <Button onClick={handleCreateFamily} className="w-full">Creer</Button>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Bonjour, {user?.firstName} !</h2>
        <p className="text-gray-600 dark:text-gray-400">{activeFamily?.name}</p>
      </div>

      {/* Members */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Membres</h3>
          <Link to="/family/settings" className="text-sm text-primary-600 hover:underline">Gerer</Link>
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

      {/* Module Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {modules.map(({ to, icon: Icon, label, color, desc }) => (
          <Link
            key={to}
            to={to}
            className="card p-4 hover:shadow-md transition-shadow group"
          >
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

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Creer un groupe">
        <div className="space-y-4">
          <Input
            label="Nom du groupe"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="Famille Dupont"
          />
          <Button onClick={handleCreateFamily} className="w-full">Creer</Button>
        </div>
      </Modal>
    </div>
  );
}
