import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import { useFamilyStore } from '../stores/familyStore';
import { useAuthStore } from '../stores/authStore';
import { Avatar } from '../components/ui/Avatar';
import { EmptyState } from '../components/ui/EmptyState';
import { getSocket } from '../config/socket';
import api from '../config/api';
import type { Message } from '@familyapp/shared';
import { format } from 'date-fns';
import { clsx } from 'clsx';

export function ChatPage() {
  const { activeFamily } = useFamilyStore();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchMessages = useCallback(async () => {
    if (!activeFamily) return;
    const { data } = await api.get(`/families/${activeFamily._id}/messages`);
    setMessages(data.messages);
  }, [activeFamily]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleMessage = (data: { message: Message }) => {
      setMessages((prev) => [...prev, data.message]);
    };

    const handleTyping = (data: { firstName: string; userId: string }) => {
      if (data.userId !== user?._id) {
        setTypingUser(data.firstName);
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 2000);
      }
    };

    socket.on('chat:message', handleMessage);
    socket.on('chat:typing', handleTyping);

    return () => {
      socket.off('chat:message', handleMessage);
      socket.off('chat:typing', handleTyping);
    };
  }, [user]);

  const sendMessage = () => {
    if (!text.trim() || !activeFamily) return;
    const socket = getSocket();
    if (socket) {
      socket.emit('chat:send', { familyId: activeFamily._id, content: text, type: 'text' });
    }
    setText('');
  };

  const handleTyping = () => {
    const socket = getSocket();
    if (socket && activeFamily) {
      socket.emit('chat:typing', { familyId: activeFamily._id });
    }
  };

  if (!activeFamily) {
    return <EmptyState icon={<MessageCircle className="w-12 h-12" />} title="Pas de groupe" description="Rejoignez un groupe pour commencer a discuter" />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-5rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <EmptyState icon={<MessageCircle className="w-12 h-12" />} title="Aucun message" description="Envoyez le premier message !" />
        ) : (
          messages.map((msg) => {
            const isOwn = (msg.sender as unknown as { _id: string })?._id === user?._id || msg.sender === user?._id;
            const sender = msg.sender as unknown as { _id: string; firstName: string; lastName: string; avatarUrl?: string };
            return (
              <div key={msg._id} className={clsx('flex gap-2', isOwn && 'flex-row-reverse')}>
                {!isOwn && <Avatar name={`${sender.firstName || ''} ${sender.lastName || ''}`} src={sender.avatarUrl} size="sm" />}
                <div className={clsx('max-w-[70%]', isOwn ? 'items-end' : 'items-start')}>
                  {!isOwn && <p className="text-xs text-gray-500 mb-0.5">{sender.firstName}</p>}
                  <div className={clsx(
                    'px-3 py-2 rounded-2xl text-sm',
                    isOwn ? 'bg-primary-600 text-white rounded-br-md' : 'bg-gray-200 dark:bg-gray-700 rounded-bl-md'
                  )}>
                    {msg.content}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{format(new Date(msg.createdAt), 'HH:mm')}</p>
                </div>
              </div>
            );
          })
        )}
        {typingUser && (
          <div className="text-xs text-gray-500 italic">{typingUser} est en train d'ecrire...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => { setText(e.target.value); handleTyping(); }}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ecrire un message..."
            className="input-field flex-1"
          />
          <button
            onClick={sendMessage}
            disabled={!text.trim()}
            className="p-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
