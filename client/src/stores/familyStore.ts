import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Family } from '@familyapp/shared';
import api from '../config/api';

interface FamilyState {
  families: Family[];
  activeFamily: Family | null;
  isLoading: boolean;
  fetchFamilies: () => Promise<void>;
  switchFamily: (familyId: string) => Promise<void>;
  createFamily: (data: { name: string; type: string }) => Promise<void>;
  inviteMember: (familyId: string, email: string, role: string) => Promise<{ id: string; token: string; email: string; expiresAt: string }>;
  removeMember: (familyId: string, userId: string) => Promise<void>;
  updateFamily: (familyId: string, data: { name?: string; type?: string }) => Promise<void>;
  deleteFamily: (familyId: string) => Promise<void>;
  leaveFamily: (familyId: string, userId: string) => Promise<void>;
}

export const useFamilyStore = create<FamilyState>()(
  persist(
    (set, get) => ({
      families: [],
      activeFamily: null,
      isLoading: false,

      fetchFamilies: async () => {
        set({ isLoading: true });
        try {
          const { data } = await api.get('/families');
          const families = data.families;
          const active = get().activeFamily;
          set({
            families,
            activeFamily: active
              ? families.find((f: Family) => f._id === active._id) || families[0] || null
              : families[0] || null,
          });
        } finally {
          set({ isLoading: false });
        }
      },

      switchFamily: async (familyId) => {
        await api.post(`/families/${familyId}/switch`);
        const family = get().families.find((f) => f._id === familyId) || null;
        set({ activeFamily: family });
      },

      createFamily: async (familyData) => {
        const { data } = await api.post('/families', familyData);
        set((state) => ({
          families: [...state.families, data.family],
          activeFamily: data.family,
        }));
      },

      inviteMember: async (familyId, email, role) => {
        const { data } = await api.post(`/families/${familyId}/invite`, { email, role });
        return data.invitation;
      },

      removeMember: async (familyId, userId) => {
        const { data } = await api.delete(`/families/${familyId}/members/${userId}`);
        set((state) => ({
          families: state.families.map((f) => (f._id === familyId ? data.family : f)),
          activeFamily: state.activeFamily?._id === familyId ? data.family : state.activeFamily,
        }));
      },

      updateFamily: async (familyId, updateData) => {
        const { data } = await api.patch(`/families/${familyId}`, updateData);
        set((state) => ({
          families: state.families.map((f) => (f._id === familyId ? data.family : f)),
          activeFamily: state.activeFamily?._id === familyId ? data.family : state.activeFamily,
        }));
      },

      deleteFamily: async (familyId) => {
        await api.delete(`/families/${familyId}`);
        set((state) => ({
          families: state.families.filter((f) => f._id !== familyId),
          activeFamily: state.activeFamily?._id === familyId ? null : state.activeFamily,
        }));
      },

      leaveFamily: async (familyId, userId) => {
        await api.delete(`/families/${familyId}/members/${userId}`);
        set((state) => ({
          families: state.families.filter((f) => f._id !== familyId),
          activeFamily: state.activeFamily?._id === familyId ? null : state.activeFamily,
        }));
      },
    }),
    {
      name: 'family-storage',
      partialize: (state) => ({
        activeFamily: state.activeFamily ? { _id: state.activeFamily._id } : null,
      }),
    }
  )
);
