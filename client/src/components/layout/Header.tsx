import { Bell, Moon, Sun } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useFamilyStore } from '../../stores/familyStore';

export function Header() {
  const { theme, setTheme } = useUIStore();
  const { activeFamily } = useFamilyStore();

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
          <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
        </div>
      </div>
    </header>
  );
}
