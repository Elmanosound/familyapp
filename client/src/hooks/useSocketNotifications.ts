import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getSocket } from '../config/socket';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import type { Message } from '@familyapp/shared';

// Shape of `sender` when populated by the API (the shared type uses `string`
// for the raw DB value, but the socket sends the full object).
interface PopulatedSender {
  _id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

/**
 * Global socket listener for cross-page notifications.
 *
 * Must be mounted inside the Router context (e.g. in AppLayout) so that
 * `useLocation` is available.
 *
 * Behaviour:
 *  - Incoming `chat:message` from another user while NOT on /chat
 *    → shows a toast + increments the unread badge
 *  - When the user navigates to /chat the badge is reset by ChatPage on mount
 */
export function useSocketNotifications() {
  const { user }     = useAuthStore();
  const { increment } = useNotificationStore();
  const { pathname }  = useLocation();

  // Keep a ref so the socket handler always reads the latest pathname without
  // needing to re-register the listener on every navigation.
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user) return;

    const handleMessage = (data: { message: Message }) => {
      const sender = data.message.sender as unknown as PopulatedSender;

      // Ignore our own messages
      if (sender?._id === user._id) return;

      // User is already on the chat page — no toast needed, messages appear inline
      if (pathnameRef.current === '/chat') return;

      const senderName = sender?.firstName ?? 'Quelqu\'un';
      const raw        = data.message.content ?? '';
      const preview    = raw.length > 45 ? `${raw.slice(0, 45)}…` : raw || '📎 Média';

      toast(`${senderName} : ${preview}`, {
        icon:     '💬',
        duration: 4500,
        style: { maxWidth: '360px' },
      });

      increment();
    };

    socket.on('chat:message', handleMessage);
    return () => { socket.off('chat:message', handleMessage); };
  // Re-register only when the user identity or increment ref changes,
  // NOT on every pathname change (pathnameRef handles that).
  }, [user, increment]);
}
