import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@familyapp/shared';
import api from '../config/api';
import { connectSocket, disconnectSocket } from '../config/socket';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; firstName: string; lastName: string; phone?: string }) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          // The server sets the refresh token as an HttpOnly cookie automatically.
          // We only store the short-lived access token in localStorage.
          localStorage.setItem('accessToken', data.accessToken);
          connectSocket(data.accessToken);
          set({ user: data.user, accessToken: data.accessToken, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (registerData) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/register', registerData);
          localStorage.setItem('accessToken', data.accessToken);
          connectSocket(data.accessToken);
          set({ user: data.user, accessToken: data.accessToken, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },

      logout: () => {
        // Calls the server to invalidate the refresh token in the DB and clear
        // the HttpOnly cookie. Fire-and-forget — we log out locally regardless.
        api.post('/auth/logout').catch(() => {});
        localStorage.removeItem('accessToken');
        disconnectSocket();
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      fetchMe: async () => {
        try {
          const token = localStorage.getItem('accessToken');
          if (!token) return;
          const { data } = await api.get('/auth/me');
          connectSocket(token);
          set({ user: data.user, accessToken: token, isAuthenticated: true });
        } catch {
          get().logout();
        }
      },

      updateProfile: async (profileData) => {
        const { data } = await api.patch('/auth/profile', profileData);
        set({ user: data.user });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
