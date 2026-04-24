import { create } from 'zustand';

interface NotificationState {
  /** Number of unread chat messages received while away from the chat page. */
  unreadCount: number;
  increment: () => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  increment: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  reset:     () => set({ unreadCount: 0 }),
}));
