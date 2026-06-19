/**
 * LM Studio chat controller.
 *
 * Endpoints:
 *  GET  /api/v1/chat/status  — check whether LM Studio is reachable
 *  POST /api/v1/chat/stream  — stream a chat completion via SSE
 *
 * Calendar-action flow (family mode):
 *  1. Keyword pre-filter on the last user message (free).
 *  2. Fast non-streaming intent-extraction call → JSON or null.
 *  3. If intent: execute Prisma write, emit { tool } SSE, stream confirmation.
 *  4. Otherwise: normal streaming call.
 *
 * This two-step approach works with any local LLM regardless of whether it
 * supports the OpenAI tool-calls protocol.
 */

import { Request, Response, NextFunction } from 'express';
import { env }                             from '../config/env.js';
import { logger }                          from '../config/logger.js';
import { buildFamilyContext }              from '../services/familyContext.service.js';
import { isFamilyMember }                   from '../utils/familyAccess.js';
import {
  looksLikeCalendarAction,
  parseCalendarLocally,
  extractCreateEventIntent,
  executeTool,
  estimateMaxTokens,
  ToolResult,
}                                          from '../services/chatTools.service.js';

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
  `Tu es FamilyBot, l'assistant IA intégré dans FamilyApp — une application de gestion familiale. ` +
  `FamilyApp permet aux familles de gérer leur agenda, leurs listes, leur budget, leurs repas et leurs photos. ` +
  `Lorsqu'on te demande depuis quelle application tu es appelé, la réponse est : FamilyApp. ` +
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

/** Pipe a LM Studio SSE stream to the client, forwarding only text content. */
async function pipeContentStream(
  body: ReadableStream<Uint8Array>,
  res:  Response,
): Promise<void> {
  const reader  = (body as ReadableStream<Uint8Array>).getReader();
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
      if (jsonStr === '[DONE]') break outer;
      try {
        const parsed  = JSON.parse(jsonStr) as LMStreamChunk;
        const content = parsed.choices?.[0]?.delta?.content ?? '';
        if (content) sseWrite(res, { content, done: false });
      } catch { /* ignore malformed chunks */ }
    }
  }
}

/** Call LM Studio in streaming mode and pipe content to the client. */
async function streamLMResponse(
  messages:  ChatMessage[],
  res:       Response,
  lmUrl:     string,
  modelId:   string,
  maxTokens: number = 512,
): Promise<boolean> {
  // Heartbeat: send an SSE comment every 20 s while the model is processing its
  // prompt (prefill).  This prevents nginx / reverse-proxies from closing the
  // connection due to proxy_read_timeout before the first token arrives.
  // SSE comment lines (": ping") are silently ignored by browsers and our client.
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* client already gone */ }
  }, 20_000);

  let lmResp: globalThis.Response;
  try {
    lmResp = await fetch(`${lmUrl}/v1/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       modelId,
        messages,
        stream:      true,
        temperature: 0.7,
        max_tokens:  maxTokens,
      }),
      signal: AbortSignal.timeout(120_000),
    }) as unknown as globalThis.Response;
  } catch (connectErr: unknown) {
    clearInterval(heartbeat);
    const cause     = (connectErr as { cause?: { code?: string } }).cause;
    const isRefused = cause?.code === 'ECONNREFUSED';
    sseWrite(res, {
      error: isRefused
        ? 'LM Studio n\'est pas accessible. Vérifiez qu\'il est bien démarré sur le NAS.'
        : 'Impossible de se connecter à LM Studio.',
    });
    return false;
  }

  // Prefill done — stop the heartbeat, tokens are about to flow
  clearInterval(heartbeat);

  if (!lmResp.ok || !lmResp.body) {
    sseWrite(res, { error: `LM Studio a retourné une erreur (HTTP ${lmResp.status}).` });
    return false;
  }

  await pipeContentStream(lmResp.body as ReadableStream<Uint8Array>, res);
  return true;
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/chat/status
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
 * SSE events:
 *   { content: string, done: false }                        — text token
 *   { tool: { name, success, message }, done: false }       — tool result card
 *   { done: true }                                          — end of stream
 *   { error: string }                                       — error (stream ends)
 */
export async function chatStream(
  req:  Request,
  res:  Response,
  next: NextFunction,
) {
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

    const modelId     = model || env.LM_STUDIO_MODEL || 'local-model';
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';

    // Family mode (context injection + calendar writes) requires the caller to
    // actually be a member of the family they reference. familyId comes from the
    // request body, so membership must be verified here — the requireFamilyMember
    // route middleware only guards :familyId params, which this endpoint has none.
    const hasFamilyAccess = !!(
      familyId && req.user && (await isFamilyMember(req.user.id, familyId))
    );

    // ── Family context (topic-filtered) ─────────────────────────────────────
    let familyContext: string | null = null;
    if (hasFamilyAccess) {
      try {
        familyContext = await buildFamilyContext(req.user!.id, familyId!, lastUserMsg || undefined);
      } catch (ctxErr) {
        logger.warn({ ctxErr, familyId }, '[chat] Failed to build family context');
      }
    }

    const systemPrompt = buildSystemPrompt(familyContext);
    const allMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // ── Calendar action detection (family mode only) ─────────────────────────

    if (hasFamilyAccess && lastUserMsg && looksLikeCalendarAction(lastUserMsg)) {
      logger.info('[chat] Calendar action keyword detected — trying local parse first');

      // Layer 1 : server-side regex parser (instant)
      let intent: Record<string, unknown> | null = parseCalendarLocally(lastUserMsg);

      if (intent) {
        logger.info({ intent, method: 'local' }, '[chat] Event intent resolved locally');
      } else {
        // Layer 2 : LM extraction fallback
        logger.info('[chat] Local parse failed — falling back to LM intent extraction');
        try {
          intent = await extractCreateEventIntent(lastUserMsg, env.LM_STUDIO_URL, modelId);
          if (intent) logger.info({ intent, method: 'lm' }, '[chat] Event intent resolved by LM');
        } catch (intentErr) {
          logger.warn({ intentErr }, '[chat] LM intent extraction error');
        }
      }

      if (intent) {

        // Execute the Prisma write
        const toolResult: ToolResult = await executeTool(
          'create_calendar_event',
          intent,
          req.user!.id,
          familyId!,
        );

        // Immediately notify the client (shows the green/red card)
        sseWrite(res, { tool: { name: 'create_calendar_event', ...toolResult }, done: false });

        // Stream a natural-language confirmation from the model
        const confirmMessages: ChatMessage[] = [
          {
            role:    'system',
            content:
              `${BASE_PROMPT}\n\n` +
              `Résultat de l'action : ${toolResult.message}\n` +
              `Confirme à l'utilisateur en 1 ou 2 phrases naturelles et amicales. ` +
              `Ne répète pas les détails techniques. ` +
              `${toolResult.success ? 'L\'action a réussi.' : 'L\'action a échoué — explique brièvement.'}`,
          },
          { role: 'user', content: lastUserMsg },
        ];

        await streamLMResponse(confirmMessages, res, env.LM_STUDIO_URL, modelId, 150);

        sseWrite(res, { done: true });
        return res.end();
      }

      logger.info('[chat] No event intent found — falling back to normal response');
    }

    // ── Normal streaming response ─────────────────────────────────────────────
    const maxTok = estimateMaxTokens(lastUserMsg);
    await streamLMResponse(allMessages, res, env.LM_STUDIO_URL, modelId, maxTok);

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
