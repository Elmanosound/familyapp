import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard, Calendar, ListTodo, MessageCircle, Image,
  MapPin, Wallet, UtensilsCrossed, Settings, LogOut, ChevronDown, Users, Package,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useFamilyStore } from '../../stores/familyStore';
import { Avatar } from '../ui/Avatar';
import { useState } from 'react';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord', color: 'text-primary-600' },
  { to: '/calendar', icon: Calendar, label: 'Calendrier', color: 'text-calendar' },
  { to: '/lists', icon: ListTodo, label: 'Listes', color: 'text-lists' },
  { to: '/inventory', icon: Package, label: 'Inventaire', color: 'text-emerald-500' },
  { to: '/chat', icon: MessageCircle, label: 'Messagerie', color: 'text-chat' },
  { to: '/media', icon: Image, label: 'Photos', color: 'text-media' },
  { to: '/location', icon: MapPin, label: 'Localisation', color: 'text-location' },
  { to: '/budget', icon: Wallet, label: 'Budget', color: 'text-budget' },
  { to: '/meals', icon: UtensilsCrossed, label: 'Repas', color: 'text-meals' },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const { families, activeFamily, switchFamily } = useFamilyStore();
  const [showFamilies, setShowFamilies] = useState(false);

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 fixed left-0 top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200 dark:border-gray-700">
        <Users className="w-8 h-8 text-primary-600" />
        <span className="text-xl font-bold text-primary-600">FamilyApp</span>
      </div>

      {/* Family Switcher */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setShowFamilies(!showFamilies)}
          className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <span className="font-medium text-sm truncate">{activeFamily?.name || 'Choisir un groupe'}</span>
          <ChevronDown className={clsx('w-4 h-4 transition-transform', showFamilies && 'rotate-180')} />
        </button>
        {showFamilies && (
          <div className="mt-1 space-y-1">
            {families.map((f) => (
              <button
                key={f._id}
                onClick={() => { switchFamily(f._id); setShowFamilies(false); }}
                className={clsx(
                  'w-full text-left px-3 py-1.5 text-sm rounded-lg',
                  f._id === activeFamily?._id ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, color }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
              )
            }
          >
            <Icon className={clsx('w-5 h-5', color)} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <NavLink
          to="/family/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 mb-1"
        >
          <Settings className="w-5 h-5" />
          Paramètres
        </NavLink>
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar name={`${user?.firstName} ${user?.lastName}`} src={user?.avatarUrl} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          </div>
          <button onClick={logout} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" title="Déconnexion">
            <LogOut className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>
    </aside>
  );
}
