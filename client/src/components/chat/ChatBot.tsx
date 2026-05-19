/**
 * FamilyBot — floating AI chatbot powered by LM Studio.
 *
 * Features:
 *  - Markdown rendering (react-markdown + remark-gfm)
 *  - Stop button (AbortController)
 *  - Starter suggestions (generic or family-aware)
 *  - Persistence (localStorage)
 *  - Copy button on hover
 *  - "Mode Famille" toggle: when active, the active family's data
 *    (calendar, lists, budget, meals) is injected into the LM Studio
 *    system prompt by the server so the bot can answer questions about
 *    the family.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot, X, Send, Loader2,
  Wifi, WifiOff, Trash2,
  Copy, Check, Users,
} from 'lucide-react';
import { useFamilyStore } from '../../stores/familyStore';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role:     'user' | 'assistant';
  content:  string;
  isError?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1';
const LS_KEY   = 'familybot-messages';
const LS_MODE  = 'familybot-family-mode';

const GENERIC_SUGGESTIONS = [
  'Quelle activité faire en famille ce week-end ?',
  'Donne-moi une recette rapide et simple pour ce soir',
  'Comment mieux organiser nos journées ?',
  'Raconte-moi une blague sympa 😄',
];

const FAMILY_SUGGESTIONS = [
  'Quels sont nos prochains événements ?',
  'Qu\'est-ce qu\'on mange cette semaine ?',
  'Comment se porte notre budget ce mois ?',
  'Qu\'est-ce qu\'il reste à faire sur nos listes ?',
];

// ── Stop-button icon ──────────────────────────────────────────────────────────

function StopSquare() {
  return <div className="w-3.5 h-3.5 rounded-sm bg-white" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatBot() {
  const activeFamily = useFamilyStore(s => s.activeFamily);

  // Restore messages and family-mode preference from localStorage
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as Message[]) : [];
    } catch { return []; }
  });

  const [familyMode, setFamilyMode] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_MODE) === 'true'; } catch { return false; }
  });

  const [isOpen,      setIsOpen]      = useState(false);
  const [input,       setInput]       = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [status,      setStatus]      = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [modelName,   setModelName]   = useState('');
  const [copiedIdx,   setCopiedIdx]   = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  // Family mode only makes sense when there is an active family
  const canUseFamily   = !!activeFamily;
  const isFamilyActive = familyMode && canUseFamily;

  // ── Persistence ───────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(messages.filter(m => !m.isError)));
    } catch { /* quota exceeded */ }
  }, [messages]);

  useEffect(() => {
    try { localStorage.setItem(LS_MODE, String(familyMode)); } catch { /* */ }
  }, [familyMode]);

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
    } catch { setStatus('offline'); }
  }, []);

  useEffect(() => {
    if (isOpen && status === 'unknown') checkStatus();
  }, [isOpen, status, checkStatus]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 120);
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Textarea auto-resize ──────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  };

  // ── Stop streaming ────────────────────────────────────────────────────────

  const stopStreaming = () => abortRef.current?.abort();

  // ── Send / stream ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || isStreaming) return;

    const userMsg:      Message = { role: 'user',      content };
    const assistantMsg: Message = { role: 'assistant', content: '' };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token   = localStorage.getItem('accessToken');
      const history = [...messages, userMsg];

      const body: Record<string, unknown> = {
        messages: history.map(({ role, content: c }) => ({ role, content: c })),
      };

      // Attach familyId when family mode is active
      if (isFamilyActive && activeFamily) {
        body.familyId = activeFamily._id;
      }

      const response = await fetch(`${BASE_URL}/chat/stream`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:   JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

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
              content?: string; done?: boolean; error?: string;
            };

            if (data.error) {
              setMessages(prev => [
                ...prev.slice(0, -1),
                { role: 'assistant', content: data.error!, isError: true },
              ]);
              break outer;
            }
            if (data.done) break outer;
            if (data.content) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + data.content },
                ];
              });
            }
          } catch { /* malformed SSE line */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant' && !last.content) {
            return [...prev.slice(0, -1), { ...last, content: '*(réponse interrompue)*' }];
          }
          return prev;
        });
      } else {
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: 'Impossible de contacter LM Studio.', isError: true },
        ]);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isStreaming, messages, isFamilyActive, activeFamily]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const copyMessage = async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch { /* clipboard not available */ }
  };

  const clearMessages = () => {
    setMessages([]);
    localStorage.removeItem(LS_KEY);
  };

  function TypingDots() {
    return (
      <span className="inline-flex items-center gap-0.5 py-0.5">
        {[0, 150, 300].map(delay => (
          <span
            key={delay}
            className="w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    );
  }

  // ── Markdown components ───────────────────────────────────────────────────

  const mdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
    pre({ children }) {
      return (
        <pre className="bg-gray-900 dark:bg-black rounded-lg p-3 overflow-x-auto my-2 text-xs">
          {children}
        </pre>
      );
    },
    code({ className, children }) {
      const isBlock = !!className?.startsWith('language-');
      return isBlock ? (
        <code className="text-green-400 font-mono whitespace-pre">{children}</code>
      ) : (
        <code className="bg-gray-200 dark:bg-gray-600 px-1 py-0.5 rounded text-xs font-mono">
          {children}
        </code>
      );
    },
    p({ children })  { return <p className="mb-2 last:mb-0">{children}</p>; },
    ul({ children }) { return <ul className="list-disc list-inside mb-2 space-y-0.5 pl-1">{children}</ul>; },
    ol({ children }) { return <ol className="list-decimal list-inside mb-2 space-y-0.5 pl-1">{children}</ol>; },
    h1({ children }) { return <h1 className="font-bold text-base mb-1 mt-2">{children}</h1>; },
    h2({ children }) { return <h2 className="font-bold mb-1 mt-2">{children}</h2>; },
    h3({ children }) { return <h3 className="font-semibold mb-1 mt-1">{children}</h3>; },
    blockquote({ children }) {
      return (
        <blockquote className="border-l-2 border-primary-400 pl-3 italic opacity-75 my-1">
          {children}
        </blockquote>
      );
    },
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer"
           className="underline text-primary-500 dark:text-primary-400 hover:opacity-80">
          {children}
        </a>
      );
    },
    strong({ children }) { return <strong className="font-semibold">{children}</strong>; },
    em({ children })     { return <em className="italic">{children}</em>; },
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const suggestions = isFamilyActive ? FAMILY_SUGGESTIONS : GENERIC_SUGGESTIONS;

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
          style={{ maxHeight: 'min(520px, calc(100dvh - 9rem))' }}
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary-600 text-white shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="w-4 h-4 shrink-0" />
              <span className="font-semibold text-sm">FamilyBot</span>

              {/* LM Studio status */}
              {status === 'online' && (
                <span className="flex items-center gap-1 text-[11px] text-green-200 min-w-0">
                  <Wifi className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[80px]">{modelName || 'en ligne'}</span>
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

            <div className="flex items-center gap-1.5 shrink-0">
              {/* ── Family mode toggle ──────────────────────────────────── */}
              {canUseFamily && (
                <button
                  onClick={() => setFamilyMode(m => !m)}
                  disabled={isStreaming}
                  className={`
                    flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium
                    transition-all border
                    ${isFamilyActive
                      ? 'bg-white/20 border-white/40 text-white'
                      : 'bg-transparent border-white/20 text-primary-200 hover:text-white hover:border-white/40'}
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                  title={isFamilyActive ? 'Désactiver le contexte famille' : 'Activer le contexte famille'}
                >
                  <Users className="w-3 h-3" />
                  <span>{isFamilyActive ? activeFamily!.name : 'Famille'}</span>
                </button>
              )}

              {/* Clear */}
              {messages.length > 0 && !isStreaming && (
                <button
                  onClick={clearMessages}
                  className="text-primary-200 hover:text-white transition"
                  title="Effacer la conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Close */}
              <button
                onClick={() => setIsOpen(false)}
                className="text-primary-200 hover:text-white transition"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Family-mode banner ────────────────────────────────────────── */}
          {isFamilyActive && (
            <div className="shrink-0 px-4 py-1.5 bg-primary-50 dark:bg-primary-900/30
                            border-b border-primary-100 dark:border-primary-800
                            flex items-center gap-1.5">
              <Users className="w-3 h-3 text-primary-600 dark:text-primary-400 shrink-0" />
              <span className="text-[11px] text-primary-700 dark:text-primary-300">
                Contexte famille activé — le bot connaît votre agenda, listes, budget et repas.
              </span>
            </div>
          )}

          {/* ── Messages ──────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 overscroll-contain">
            {messages.length === 0 ? (

              /* Empty state with suggestions */
              <div className="flex flex-col items-center py-6 gap-3">
                <Bot className="w-10 h-10 opacity-20 text-gray-400 dark:text-gray-500" />
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {isFamilyActive
                    ? `Bonjour ! Je connais les données de "${activeFamily!.name}".`
                    : 'Posez-moi une question !'}
                </p>
                {status === 'offline' && (
                  <p className="text-xs text-red-400 text-center max-w-[200px]">
                    LM Studio semble hors ligne.<br />
                    Démarrez-le sur le NAS pour commencer.
                  </p>
                )}
                <div className="flex flex-col gap-1.5 w-full mt-1">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      disabled={status !== 'online'}
                      className="
                        text-left text-xs px-3 py-2 rounded-xl
                        border border-gray-200 dark:border-gray-600
                        bg-gray-50 dark:bg-gray-700/50
                        text-gray-600 dark:text-gray-300
                        hover:bg-primary-50 dark:hover:bg-primary-900/20
                        hover:border-primary-300 dark:hover:border-primary-700
                        hover:text-primary-700 dark:hover:text-primary-300
                        disabled:opacity-40 disabled:cursor-not-allowed
                        transition-all
                      "
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

            ) : (
              messages.map((msg, i) => {
                const isLast   = i === messages.length - 1;
                const isTyping = isLast && msg.role === 'assistant' && !msg.content && isStreaming;

                return (
                  <div key={i}
                       className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                    {/* Bot avatar */}
                    {msg.role === 'assistant' && (
                      <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}

                    {/* Bubble + copy */}
                    <div className="group max-w-[78%] flex flex-col">
                      <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white rounded-br-sm'
                          : msg.isError
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-bl-sm'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
                      }`}>
                        {isTyping ? (
                          <TypingDots />
                        ) : msg.role === 'user' ? (
                          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</span>
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </div>

                      {/* Copy on hover */}
                      {!isTyping && msg.content && (
                        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 justify-end">
                          <button
                            onClick={() => copyMessage(msg.content, i)}
                            className="flex items-center gap-1 text-[11px]
                                       text-gray-400 hover:text-gray-600
                                       dark:hover:text-gray-300 transition-colors"
                          >
                            {copiedIdx === i
                              ? <><Check className="w-3 h-3 text-green-500" /><span className="text-green-500">Copié</span></>
                              : <><Copy className="w-3 h-3" /><span>Copier</span></>}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Input ─────────────────────────────────────────────────────── */}
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

              {isStreaming ? (
                <button
                  onClick={stopStreaming}
                  className="shrink-0 w-9 h-9 rounded-xl bg-red-500 hover:bg-red-600
                             flex items-center justify-center transition"
                  aria-label="Arrêter"
                >
                  <StopSquare />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim()}
                  className="shrink-0 w-9 h-9 rounded-xl bg-primary-600 text-white
                             flex items-center justify-center hover:bg-primary-700
                             disabled:opacity-40 disabled:cursor-not-allowed transition"
                  aria-label="Envoyer"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating button ────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className={`
          fixed z-50
          right-4 bottom-[4.75rem]
          md:right-6 md:bottom-6
          w-12 h-12 rounded-full shadow-lg
          flex items-center justify-center
          transition-all duration-200 active:scale-95
          ${isOpen ? 'bg-gray-500 hover:bg-gray-600' : 'bg-primary-600 hover:bg-primary-700'}
        `}
        aria-label={isOpen ? 'Fermer FamilyBot' : 'Ouvrir FamilyBot'}
      >
        {isOpen ? <X className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
      </button>
    </>
  );
}
