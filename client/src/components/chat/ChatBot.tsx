/**
 * FamilyBot — floating AI chatbot powered by LM Studio.
 *
 * A 💬 button sits above the bottom navigation bar on mobile and at the
 * bottom-right corner on desktop. Clicking it opens a chat panel that streams
 * responses from the local LM Studio instance via the /api/v1/chat/stream
 * SSE endpoint.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, X, Send, Loader2, Wifi, WifiOff, Trash2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role:     'user' | 'assistant';
  content:  string;
  isError?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1';

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatBot() {
  const [isOpen,      setIsOpen]      = useState(false);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [status,      setStatus]      = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [modelName,   setModelName]   = useState('');

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  // ── Status check ──────────────────────────────────────────────────────────

  const checkStatus = useCallback(async () => {
    setStatus('unknown');
    try {
      const token = localStorage.getItem('accessToken');
      const resp  = await fetch(`${BASE_URL}/chat/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await resp.json() as { online: boolean; models?: string[] };
      setStatus(data.online ? 'online' : 'offline');
      if (data.models?.[0]) setModelName(data.models[0]);
    } catch {
      setStatus('offline');
    }
  }, []);

  // Check status the first time the panel opens.
  useEffect(() => {
    if (isOpen && status === 'unknown') checkStatus();
  }, [isOpen, status, checkStatus]);

  // Focus textarea when the panel becomes visible.
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 120);
  }, [isOpen]);

  // Auto-scroll to newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Auto-resize textarea ──────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  };

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || isStreaming) return;

    const userMsg:      Message = { role: 'user',      content };
    const assistantMsg: Message = { role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');

    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';

    setIsStreaming(true);

    try {
      const token  = localStorage.getItem('accessToken');
      const history: Message[] = [...messages, userMsg];

      const response = await fetch(`${BASE_URL}/chat/stream`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: history.map(({ role, content: c }) => ({ role, content: c })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6)) as {
              content?: string;
              done?:    boolean;
              error?:   string;
            };

            if (data.error) {
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: 'assistant', content: data.error!, isError: true },
              ]);
              break outer;
            }
            if (data.done) break outer;
            if (data.content) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + data.content },
                ];
              });
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Impossible de contacter LM Studio.', isError: true },
      ]);
    } finally {
      setIsStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isStreaming, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Typing indicator (three bouncing dots) ────────────────────────────────

  function TypingDots() {
    return (
      <span className="inline-flex items-center gap-0.5 py-0.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="
            fixed z-50
            right-4 bottom-[5.5rem]
            md:right-6 md:bottom-[4.5rem]
            lg:bottom-20
            w-80 sm:w-96
            flex flex-col
            rounded-2xl overflow-hidden
            shadow-2xl
            bg-white dark:bg-gray-800
            border border-gray-200 dark:border-gray-700
          "
          style={{ maxHeight: 'min(440px, calc(100dvh - 9rem))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary-600 text-white shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="w-4 h-4 shrink-0" />
              <span className="font-semibold text-sm">FamilyBot</span>
              {/* Status badge */}
              {status === 'online' && (
                <span className="flex items-center gap-1 text-[11px] text-green-200 min-w-0">
                  <Wifi className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[100px]">
                    {modelName || 'en ligne'}
                  </span>
                </span>
              )}
              {status === 'offline' && (
                <span className="flex items-center gap-1 text-[11px] text-red-200">
                  <WifiOff className="w-3 h-3 shrink-0" /> hors ligne
                </span>
              )}
              {status === 'unknown' && (
                <Loader2 className="w-3 h-3 animate-spin text-primary-200 shrink-0" />
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {messages.length > 0 && !isStreaming && (
                <button
                  onClick={() => setMessages([])}
                  className="text-primary-200 hover:text-white transition"
                  title="Effacer la conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-primary-200 hover:text-white transition"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 overscroll-contain">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-500 py-8 gap-2">
                <Bot className="w-10 h-10 opacity-25" />
                <p className="text-sm font-medium">Posez-moi une question !</p>
                {status === 'offline' && (
                  <p className="text-xs text-red-400 mt-1 max-w-[200px]">
                    LM Studio semble hors ligne.<br />
                    Démarrez-le sur le NAS pour commencer.
                  </p>
                )}
              </div>
            ) : (
              messages.map((msg, i) => {
                const isLast    = i === messages.length - 1;
                const isTyping  = isLast && msg.role === 'assistant' && !msg.content && isStreaming;

                return (
                  <div
                    key={i}
                    className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* Bot avatar */}
                    {msg.role === 'assistant' && (
                      <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white rounded-br-sm'
                          : msg.isError
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-bl-sm'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
                      }`}
                    >
                      {isTyping ? <TypingDots /> : (
                        // Preserve newlines from the model output
                        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.content}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-gray-100 dark:border-gray-700 p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Votre message… (Entrée pour envoyer)"
                rows={1}
                disabled={isStreaming}
                className="
                  flex-1 resize-none overflow-y-auto
                  rounded-xl border border-gray-200 dark:border-gray-600
                  bg-white dark:bg-gray-700
                  px-3 py-2 text-sm
                  text-gray-900 dark:text-gray-100
                  placeholder-gray-400 dark:placeholder-gray-500
                  focus:outline-none focus:ring-2 focus:ring-primary-500
                  disabled:opacity-60
                "
                style={{ minHeight: '36px', maxHeight: '80px' }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming}
                className="
                  shrink-0 w-9 h-9 rounded-xl
                  bg-primary-600 text-white
                  flex items-center justify-center
                  hover:bg-primary-700
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition
                "
                aria-label="Envoyer"
              >
                {isStreaming
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating button ────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={`
          fixed z-50
          right-4 bottom-[4.75rem]
          md:right-6 md:bottom-6
          w-12 h-12 rounded-full shadow-lg
          flex items-center justify-center
          transition-all duration-200 active:scale-95
          ${isOpen
            ? 'bg-gray-500 hover:bg-gray-600'
            : 'bg-primary-600 hover:bg-primary-700'}
        `}
        aria-label={isOpen ? 'Fermer FamilyBot' : 'Ouvrir FamilyBot'}
      >
        {isOpen
          ? <X    className="w-5 h-5 text-white" />
          : <Bot  className="w-5 h-5 text-white" />}
      </button>
    </>
  );
}
