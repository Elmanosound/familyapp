import { Bell, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';
import { useFamilyStore } from '../../stores/familyStore';
import { useNotificationStore } from '../../stores/notificationStore';

export function Header() {
  const { theme, setTheme }  = useUIStore();
  const { activeFamily }     = useFamilyStore();
  const { unreadCount }      = useNotificationStore();
  const navigate             = useNavigate();

  return (
    <header className="sticky top-0 z-20 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between h-14 px-4 lg:px-6">
        <h1 className="text-lg font-semibold lg:hidden">{activeFamily?.name || 'FamilyApp'}</h1>
        <div className="hidden lg:block" />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>

          <button
            onClick={() => navigate('/chat')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 relative"
            aria-label={unreadCount > 0 ? `${unreadCount} message(s) non lu(s)` : 'Notifications'}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
