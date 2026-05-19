/**
 * LM Studio chat controller.
 *
 * Endpoints:
 *  GET  /api/v1/chat/status  — check whether LM Studio is reachable
 *  POST /api/v1/chat/stream  — stream a chat completion via SSE
 *
 * When the client sends `familyId` in the POST body and the requesting user
 * belongs to that family, a family-context block is prepended to the system
 * prompt so the model can answer questions about the family's data.
 */

import { Request, Response, NextFunction } from 'express';
import { env }                             from '../config/env.js';
import { logger }                          from '../config/logger.js';
import { buildFamilyContext }              from '../services/familyContext.service.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role:    'system' | 'user' | 'assistant';
  content: string;
}

interface LMStreamChunk {
  choices?: { delta?: { content?: string } }[];
}

// ── System prompts ────────────────────────────────────────────────────────────

const BASE_PROMPT =
  `Tu es FamilyBot, un assistant IA sympathique intégré dans une application familiale. ` +
  `Sois concis, utile et amical. Réponds par défaut en français, ` +
  `mais adapte-toi toujours à la langue utilisée par l'utilisateur.`;

const CONTEXT_INTRO =
  `Tu as accès aux informations actuelles de la famille ci-dessous. ` +
  `Utilise-les pour personnaliser tes réponses quand c'est pertinent — ` +
  `sans les réciter inutilement.\n\n`;

function buildSystemPrompt(familyContext: string | null): string {
  if (!familyContext) return BASE_PROMPT;
  return `${BASE_PROMPT}\n\n${CONTEXT_INTRO}${familyContext}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

    const body   = await resp.json() as { data?: { id: string }[] };
    const models = (body.data ?? []).map((m) => m.id);
    res.json({ online: true, models });
  } catch {
    res.json({ online: false });
  }
}

/**
 * POST /api/v1/chat/stream
 * Body: { messages: ChatMessage[], familyId?: string, model?: string }
 *
 * When `familyId` is provided and the authenticated user is a member of that
 * family, the family's live data (calendar, lists, budget, meals) is fetched
 * from the database and injected into the LM Studio system prompt.
 *
 * Streams the response back to the client as SSE events:
 *   data: {"content":"<token>","done":false}
 *   data: {"done":true}
 *   data: {"error":"<message>"}
 */
export async function chatStream(
  req:  Request,
  res:  Response,
  next: NextFunction,
) {
  // Flush SSE headers immediately — from this point on we must NOT call
  // next(error) but write an error SSE event and end the response instead.
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const { messages, familyId, model } = req.body as {
      messages?: ChatMessage[];
      familyId?: string;
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

    // ── Optionally enrich system prompt with family context ──────────────────
    let familyContext: string | null = null;
    if (familyId && req.user) {
      try {
        familyContext = await buildFamilyContext(req.user.id, familyId);
      } catch (ctxErr) {
        // Non-fatal — proceed without context rather than aborting the chat
        logger.warn({ ctxErr, familyId }, '[chat] Failed to build family context');
      }
    }

    const systemPrompt = buildSystemPrompt(familyContext);

    const allMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // ── Call LM Studio ───────────────────────────────────────────────────────
    let lmResp: globalThis.Response;
    try {
      lmResp = await fetch(`${env.LM_STUDIO_URL}/v1/chat/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:       model || env.LM_STUDIO_MODEL || 'local-model',
          messages:    allMessages,
          stream:      true,
          temperature: 0.7,
          max_tokens:  1024,
        }),
        signal: AbortSignal.timeout(120_000),
      }) as unknown as globalThis.Response;
    } catch (connectErr: unknown) {
      const cause     = (connectErr as { cause?: { code?: string } }).cause;
      const isRefused = cause?.code === 'ECONNREFUSED';
      sseWrite(res, {
        error: isRefused
          ? 'LM Studio n\'est pas accessible. Vérifiez qu\'il est bien démarré sur le NAS.'
          : 'Impossible de se connecter à LM Studio.',
      });
      return res.end();
    }

    if (!lmResp.ok || !lmResp.body) {
      sseWrite(res, {
        error: `LM Studio a retourné une erreur (HTTP ${lmResp.status}).`,
      });
      return res.end();
    }

    // ── Forward SSE stream ───────────────────────────────────────────────────
    const reader  = (lmResp.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

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
    try {
      sseWrite(res, { error: 'Erreur inattendue lors de la communication avec LM Studio.' });
      res.end();
    } catch { /* client already disconnected */ }
  }
}
