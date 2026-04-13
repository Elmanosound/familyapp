import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { AppRouter } from './router';
import { useAuthStore } from './stores/authStore';
import { useUIStore } from './stores/uiStore';

export default function App() {
  const { fetchMe, isAuthenticated } = useAuthStore();
  const { theme } = useUIStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <>
      <AppRouter />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '12px',
            fontSize: '14px',
          },
        }}
      />
    </>
  );
}
