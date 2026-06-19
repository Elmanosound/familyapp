/**
 * chatTools.service.ts
 *
 * Calendar-action detection + execution for FamilyBot.
 *
 * Detection strategy (two layers, executed in order):
 *
 *  1. parseCalendarLocally()     — pure regex/JS, zero latency, zero LM call.
 *                                  Handles the vast majority of everyday requests.
 *  2. extractCreateEventIntent() — fallback LM call (non-streaming, temp=0)
 *                                  for cases the local parser couldn't resolve.
 *
 * After detection, executeTool() writes the event to the database via Prisma.
 */

import { prisma } from '../config/db.js';

// ── Layer 1 — server-side calendar parser ─────────────────────────────────────

const CREATION_VERBS = [
  'ajoute', 'ajouter', 'crée', 'créer', 'planifie', 'planifier',
  'programme', 'programmer', 'inscris', 'bloque', 'organise',
  'prévois', 'prévoir', 'note', 'noter', 'rappelle',
  'add', 'create', 'schedule', 'plan',
];

export function looksLikeCalendarAction(message: string): boolean {
  const lower = message.toLowerCase();
  return CREATION_VERBS.some(k => lower.includes(k));
}

/** Day-name → ISO weekday (0 = Sunday, Intl standard). */
const DAY_MAP: Record<string, number> = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3,
  jeudi: 4, vendredi: 5, samedi: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

/**
 * Attempts to extract calendar event parameters from the message without any
 * LM call.  Returns null if the message is too ambiguous to parse reliably.
 */
export function parseCalendarLocally(
  message: string,
): Record<string, unknown> | null {
  const raw   = message;
  const lower = message.toLowerCase();

  // Must contain a creation verb
  if (!CREATION_VERBS.some(k => lower.includes(k))) return null;

  const today      = new Date();
  const isProchain = /\bprochain[e]?\b/.test(lower);
  let   targetDate: Date | null = null;

  // ── Date resolution ────────────────────────────────────────────────────────

  if (/\bdemain\b/.test(lower)) {
    targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 1);
  } else if (/\baprès-demain\b/.test(lower)) {
    targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 2);
  } else {
    for (const [name, num] of Object.entries(DAY_MAP)) {
      if (lower.includes(name)) {
        const curr         = today.getDay();
        const originalDiff = num - curr;
        let   diff         = originalDiff;

        if (diff < 0)  diff += 7; // day already passed this week → next occurrence
        if (diff === 0) diff  = 7; // same day as today → next week

        // "prochain" only boosts when the day is still coming naturally this week
        // (originalDiff > 0) so we don't double-jump when already pushed to next week
        if (isProchain && originalDiff > 0) diff += 7;

        targetDate = new Date(today);
        targetDate.setDate(today.getDate() + diff);
        break;
      }
    }
  }

  // Absolute date patterns: "le 26 mai", "26/05", "26-05-2026"
  if (!targetDate) {
    const absMatch =
      lower.match(/\b(\d{1,2})\s+(?:jan(?:vier)?|fév(?:rier)?|mar(?:s)?|avr(?:il)?|mai|juin|juil(?:let)?|aoû?t|sep(?:tembre)?|oct(?:obre)?|nov(?:embre)?|déc(?:embre)?)\b/) ||
      lower.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?\b/);
    if (absMatch) {
      // Let LM handle these — they're too varied for a reliable regex
      return null;
    }
  }

  if (!targetDate) return null;

  // ── Time resolution ────────────────────────────────────────────────────────

  const timeMatch =
    lower.match(/\bà\s+(\d{1,2})[h:](\d{2})?\b/) ||
    lower.match(/\b(\d{1,2})[h:](\d{2})\b/);

  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      targetDate.setHours(h, m, 0, 0);
    } else {
      targetDate.setHours(9, 0, 0, 0);
    }
  } else {
    // No time specified → 09:00 default (event probably all-day or morning)
    targetDate.setHours(9, 0, 0, 0);
  }

  // ── Title extraction ───────────────────────────────────────────────────────

  const NOISE = new Set([
    ...CREATION_VERBS,
    'un', 'une', 'le', 'la', 'les', 'des', 'du', 'au', 'aux',
    'à', 'a',
    'mon', 'ma', 'mes', 'nos', 'votre', 'vos', 'ton', 'ta',
    'prochain', 'prochaine', 'suivant', 'suivante',
    'soir', 'matin', 'midi', 'nuit', 'semaine', 'weekend', 'week-end',
    'cette', 'ce', 'cet', 'demain', 'après-demain',
    'dans', 'sur', 'pour', 'par', 'de', 'en', 'et', 'ou',
    'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  ]);

  let title = raw
    // Remove "à HHhMM" / "à HH:MM" patterns first
    // (avoid \b with accented chars — use \s+ instead)
    .replace(/\s+à\s+\d{1,2}[h:]\d{0,2}/gi, '')
    .replace(/\b\d{1,2}[h:]\d{2}\b/gi, '')
    // Filter word by word
    .split(/\s+/)
    .filter(w => {
      const clean = w.toLowerCase().replace(/[^a-zàâéèêëîïôùûüç0-9]/gi, '');
      return clean.length > 0 && !NOISE.has(clean);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalise first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  if (!title || title.length < 2) return null;

  return {
    create:    true,
    title,
    startDate: targetDate.toISOString().slice(0, 19),
    allDay:    false,
  };
}

// ── Adaptive max_tokens ───────────────────────────────────────────────────────

/**
 * Returns an appropriate max_tokens ceiling based on the likely response length.
 * Avoids wasting context window on responses that should be short.
 */
export function estimateMaxTokens(message: string): number {
  const lower = message.toLowerCase();

  // Very short factual queries → compact answer
  const FACTUAL = ['combien', 'quel', 'quelle', 'quand', 'qui', 'où', 'solde', 'budget',
                   'prochain', 'prochains', 'prochaine', 'liste', 'how many', 'what is', 'when'];
  if (FACTUAL.some(k => lower.includes(k)) && lower.length < 80) return 256;

  // Moderate queries
  const MODERATE = ['qu\'est-ce', 'explique', 'résumé', 'résume', 'semaine', 'activité', 'event'];
  if (MODERATE.some(k => lower.includes(k))) return 400;

  // Creative / advice / long-form
  const LONGFORM = ['conseil', 'idée', 'suggestion', 'aide-moi', 'comment', 'pourquoi',
                    'raconte', 'propose', 'activité', 'recette', 'organise'];
  if (LONGFORM.some(k => lower.includes(k))) return 600;

  // Default
  return 450;
}

// ── Layer 2 — LM fallback intent extraction ───────────────────────────────────

/**
 * Non-streaming LM call that asks the model to return ONLY a JSON object.
 * Used as fallback when parseCalendarLocally() returns null.
 */
export async function extractCreateEventIntent(
  userMessage: string,
  lmStudioUrl: string,
  modelId:     string,
): Promise<Record<string, unknown> | null> {
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  let resp: globalThis.Response;
  try {
    resp = await fetch(`${lmStudioUrl}/v1/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       modelId,
        stream:      false,
        temperature: 0,
        max_tokens:  120,
        messages: [
          {
            role: 'system',
            content:
              `Réponds UNIQUEMENT avec du JSON valide. Zéro texte autour.\n` +
              `Aujourd'hui : ${today}. Demain : ${tomorrow}.\n\n` +
              `Événement à créer → {"create":1,"title":"...","startDate":"YYYY-MM-DDTHH:mm:ss","allDay":0}\n` +
              `Pas d'événement   → {"create":0}\n\n` +
              `Convertis les dates relatives (demain, lundi prochain…) en dates ISO absolues.\n` +
              `Réponds SEULEMENT avec le JSON. Rien avant, rien après.`,
          },
          { role: 'user', content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    }) as unknown as globalThis.Response;
  } catch {
    return null;
  }

  if (!resp.ok) return null;

  try {
    const body = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    let   raw  = (body.choices?.[0]?.message?.content ?? '').trim();

    // Strip markdown fences if the model wrapped the JSON
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;

    const shouldCreate = parsed.create === 1 || parsed.create === true;
    if (!shouldCreate || !parsed.title || !parsed.startDate) return null;

    return parsed;
  } catch {
    return null;
  }
}

// ── Tool result type ──────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  message: string;
}

// ── Tool dispatcher ───────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  rawArgs:  string | Record<string, unknown>,
  userId:   string,
  familyId: string,
): Promise<ToolResult> {
  let args: Record<string, unknown>;
  try {
    args = typeof rawArgs === 'string'
      ? (JSON.parse(rawArgs) as Record<string, unknown>)
      : rawArgs;
  } catch {
    return { success: false, message: 'Arguments invalides.' };
  }

  try {
    if (toolName === 'create_calendar_event') return createCalendarEvent(args, userId, familyId);
    return { success: false, message: `Outil inconnu : "${toolName}"` };
  } catch (err) {
    return { success: false, message: `Erreur : ${String(err)}` };
  }
}

// ── create_calendar_event ─────────────────────────────────────────────────────

async function createCalendarEvent(
  args:     Record<string, unknown>,
  userId:   string,
  familyId: string,
): Promise<ToolResult> {
  const title       = String(args.title       ?? '').trim();
  const startRaw    = String(args.startDate   ?? '').trim();
  const endRaw      = args.endDate     ? String(args.endDate)    : null;
  const allDay      = args.allDay === true || args.allDay === 1;
  const location    = args.location    ? String(args.location)   : null;
  const description = args.description ? String(args.description): null;
  const color       = args.color       ? String(args.color)      : '#3B82F6';

  if (!title)    return { success: false, message: 'Titre manquant.' };
  if (!startRaw) return { success: false, message: 'Date de début manquante.' };

  const start = new Date(startRaw);
  if (isNaN(start.getTime())) {
    return { success: false, message: `Date invalide : "${startRaw}"` };
  }

  const end = (endRaw && !isNaN(new Date(endRaw).getTime()))
    ? new Date(endRaw)
    : allDay
      ? new Date(start.getTime() + 86_400_000)
      : new Date(start.getTime() + 3_600_000);

  const event = await prisma.calendarEvent.create({
    data: { familyId, title, startDate: start, endDate: end, allDay, location, description, color, createdById: userId },
  });

  const fmt = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(start);

  return {
    success: true,
    message: `"${event.title}" ajouté au calendrier : ${fmt}${location ? ` — ${location}` : ''}.`,
  };
}
