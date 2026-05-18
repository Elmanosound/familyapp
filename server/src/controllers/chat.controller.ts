/**
 * LM Studio chat controller.
 *
 * Provides two endpoints:
 *  - GET  /api/v1/chat/status  — check whether LM Studio is reachable
 *  - POST /api/v1/chat/stream  — stream a chat completion via SSE
 *
 * LM Studio exposes an OpenAI-compatible API; all we do here is proxy the
 * request and forward the SSE stream so the browser doesn't have to talk to
 * LM Studio directly (CORS, authentication, same-origin policy).
 */

import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role:    'system' | 'user' | 'assistant';
  content: string;
}

interface LMStreamChunk {
  choices?: { delta?: { content?: string } }[];
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  `Tu es FamilyBot, un assistant IA sympathique intégré dans une application familiale. ` +
  `Sois concis, utile et amical. Réponds par défaut en français, ` +
  `mais adapte-toi toujours à la langue utilisée par l'utilisateur.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Write a JSON object as a single SSE event. */
function sseWrite(res: Response, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/chat/status
 * Pings LM Studio's /v1/models endpoint. Returns { online, models }.
 */
export async function chatStatus(_req: Request, res: Response) {
  if (!env.LM_STUDIO_URL) {
    return res.json({ online: false, reason: 'LM_STUDIO_URL not configured' });
  }

  try {
    const resp = await fetch(`${env.LM_STUDIO_URL}/v1/models`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!resp.ok) return res.json({ online: false });

    const body = await resp.json() as { data?: { id: string }[] };
    const models = (body.data ?? []).map((m) => m.id);
    res.json({ online: true, models });
  } catch {
    res.json({ online: false });
  }
}

/**
 * POST /api/v1/chat/stream
 * Body: { messages: ChatMessage[], model?: string }
 *
 * Streams the LM Studio response back to the client as SSE.
 * Each event is one of:
 *   data: {"content":"<token>","done":false}
 *   data: {"done":true}
 *   data: {"error":"<message>"}
 */
export async function chatStream(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Set SSE headers before any potential error throws — once headers are sent
  // we must not call next(error) but instead write an error event.
  res.setHeader('Content-Type',     'text/event-stream');
  res.setHeader('Cache-Control',    'no-cache');
  res.setHeader('Connection',       'keep-alive');
  res.setHeader('X-Accel-Buffering','no');  // disable nginx / Caddy buffering
  res.flushHeaders();

  try {
    const { messages, model } = req.body as {
      messages?: ChatMessage[];
      model?:    string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      sseWrite(res, { error: 'messages array is required' });
      return res.end();
    }

    if (!env.LM_STUDIO_URL) {
      sseWrite(res, { error: 'LM Studio URL not configured on this server.' });
      return res.end();
    }

    // Prepend system prompt
    const allMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    // ── Call LM Studio ───────────────────────────────────────────────────────
    let lmResp: Response | globalThis.Response;
    try {
      lmResp = await fetch(`${env.LM_STUDIO_URL}/v1/chat/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model:       model || env.LM_STUDIO_MODEL || 'local-model',
          messages:    allMessages,
          stream:      true,
          temperature: 0.7,
          max_tokens:  1024,
        }),
        signal: AbortSignal.timeout(120_000),
      }) as unknown as globalThis.Response;
    } catch (connectErr: unknown) {
      const cause = (connectErr as { cause?: { code?: string } }).cause;
      const isRefused = cause?.code === 'ECONNREFUSED';
      sseWrite(res, {
        error: isRefused
          ? 'LM Studio n\'est pas accessible. Vérifiez qu\'il est bien démarré sur le NAS.'
          : 'Impossible de se connecter à LM Studio.',
      });
      return res.end();
    }

    if (!(lmResp as globalThis.Response).ok || !(lmResp as globalThis.Response).body) {
      sseWrite(res, {
        error: `LM Studio a retourné une erreur (HTTP ${(lmResp as globalThis.Response).status}).`,
      });
      return res.end();
    }

    // ── Forward the SSE stream ────────────────────────────────────────────────
    const reader  = ((lmResp as globalThis.Response).body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';   // keep incomplete last line for next chunk

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') {
          sseWrite(res, { done: true });
          break outer;
        }

        try {
          const parsed  = JSON.parse(jsonStr) as LMStreamChunk;
          const content = parsed.choices?.[0]?.delta?.content ?? '';
          if (content) sseWrite(res, { content, done: false });
        } catch { /* ignore malformed chunks */ }
      }
    }

    sseWrite(res, { done: true });
    res.end();
  } catch (err) {
    logger.warn({ err }, '[chat] Unexpected stream error');
    // Headers already sent — write error event instead of calling next(err)
    try {
      sseWrite(res, { error: 'Erreur inattendue lors de la communication avec LM Studio.' });
      res.end();
    } catch { /* client already disconnected */ }
  }
}
