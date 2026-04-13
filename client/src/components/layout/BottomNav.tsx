import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { LayoutDashboard, Calendar, ListTodo, MessageCircle, Menu } from 'lucide-react';
import { useState } from 'react';
import { Image, MapPin, Wallet, UtensilsCrossed, Settings, X } from 'lucide-react';

const primaryTabs = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Accueil' },
  { to: '/calendar', icon: Calendar, label: 'Calendrier' },
  { to: '/lists', icon: ListTodo, label: 'Listes' },
  { to: '/chat', icon: MessageCircle, label: 'Chat' },
];

const moreTabs = [
  { to: '/media', icon: Image, label: 'Photos' },
  { to: '/location', icon: MapPin, label: 'Carte' },
  { to: '/budget', icon: Wallet, label: 'Budget' },
  { to: '/meals', icon: UtensilsCrossed, label: 'Repas' },
  { to: '/family/settings', icon: Settings, label: 'Paramètres' },
];

export function BottomNav() {
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMore(false)} />
          <div className="absolute bottom-16 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Plus</h3>
              <button onClick={() => setShowMore(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {moreTabs.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setShowMore(false)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Icon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {primaryTabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5',
                  isActive ? 'text-primary-600' : 'text-gray-500'
                )
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setShowMore(!showMore)}
            className={clsx('flex flex-col items-center gap-0.5 px-3 py-1.5', showMore ? 'text-primary-600' : 'text-gray-500')}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">Plus</span>
          </button>
        </div>
      </nav>
    </>
  );
}
