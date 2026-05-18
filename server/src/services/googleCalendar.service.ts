/**
 * Google Calendar API wrapper.
 *
 * All functions are safe to call even when Google credentials are not
 * configured — they return empty/null silently so the rest of the app
 * keeps working without Google integration.
 */

import { google, type calendar_v3 } from 'googleapis';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ── OAuth2 factory ────────────────────────────────────────────────────────────

export function makeOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

/** Returns true when Google OAuth credentials are configured. */
export function googleEnabled(): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

// ── Authed client ─────────────────────────────────────────────────────────────

/**
 * Build an OAuth2 client with the stored tokens for `userId`.
 * Returns `null` if the user has not connected Google Calendar.
 * Automatically persists refreshed access tokens back to the DB.
 */
export async function getAuthedClient(userId: string) {
  const token = await prisma.googleToken.findUnique({ where: { userId } });
  if (!token) return null;

  const auth = makeOAuth2Client();
  auth.setCredentials({
    access_token:  token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date:   token.expiresAt.getTime(),
  });

  // Persist refreshed tokens automatically (Google rotates access_token).
  auth.on('tokens', async (tokens) => {
    try {
      const updates: Record<string, unknown> = {};
      if (tokens.access_token) updates.accessToken = tokens.access_token;
      if (tokens.expiry_date)  updates.expiresAt   = new Date(tokens.expiry_date);
      if (Object.keys(updates).length > 0) {
        await prisma.googleToken.update({ where: { userId }, data: updates });
      }
    } catch (err) {
      logger.warn({ err }, '[google] Failed to persist refreshed tokens');
    }
  });

  return auth;
}

// ── Event helpers ─────────────────────────────────────────────────────────────

export interface GoogleEventInput {
  title:        string;
  description?: string;
  startDate:    Date;
  endDate:      Date;
  allDay:       boolean;
}

function buildEventBody(event: GoogleEventInput): calendar_v3.Schema$Event {
  return {
    summary:     event.title,
    description: event.description ?? undefined,
    ...(event.allDay
      ? {
          start: { date: event.startDate.toISOString().slice(0, 10) },
          end:   { date: event.endDate.toISOString().slice(0, 10) },
        }
      : {
          start: { dateTime: event.startDate.toISOString() },
          end:   { dateTime: event.endDate.toISOString() },
        }),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List all events (instances expanded) in [startDate, endDate) from the
 * user's primary Google Calendar. Returns [] when not connected or on error.
 */
export async function listGoogleEvents(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<calendar_v3.Schema$Event[]> {
  if (!googleEnabled()) return [];
  const auth = await getAuthedClient(userId);
  if (!auth) return [];

  try {
    const cal = google.calendar({ version: 'v3', auth });
    const resp = await cal.events.list({
      calendarId:   'primary',
      timeMin:      startDate.toISOString(),
      timeMax:      endDate.toISOString(),
      singleEvents: true,   // expand recurring events into instances
      orderBy:      'startTime',
      maxResults:   250,
    });
    return resp.data.items ?? [];
  } catch (err) {
    logger.warn({ err, userId }, '[google] listGoogleEvents failed');
    return [];
  }
}

/**
 * Create an event in the user's primary Google Calendar.
 * Returns the new Google event ID, or `null` if not connected / error.
 */
export async function createGoogleEvent(
  userId: string,
  event: GoogleEventInput,
): Promise<string | null> {
  if (!googleEnabled()) return null;
  const auth = await getAuthedClient(userId);
  if (!auth) return null;

  try {
    const cal  = google.calendar({ version: 'v3', auth });
    const resp = await cal.events.insert({
      calendarId:  'primary',
      requestBody: buildEventBody(event),
    });
    return resp.data.id ?? null;
  } catch (err) {
    logger.warn({ err, userId }, '[google] createGoogleEvent failed');
    return null;
  }
}

/**
 * Update an existing event in the user's primary Google Calendar.
 * Silently no-ops if not connected or on error.
 */
export async function updateGoogleEvent(
  userId: string,
  googleEventId: string,
  event: GoogleEventInput,
): Promise<void> {
  if (!googleEnabled()) return;
  const auth = await getAuthedClient(userId);
  if (!auth) return;

  try {
    const cal = google.calendar({ version: 'v3', auth });
    await cal.events.update({
      calendarId:  'primary',
      eventId:     googleEventId,
      requestBody: buildEventBody(event),
    });
  } catch (err) {
    logger.warn({ err, userId, googleEventId }, '[google] updateGoogleEvent failed');
  }
}

/**
 * Delete an event from the user's primary Google Calendar.
 * Silently no-ops if not connected, event not found, or on error.
 */
export async function deleteGoogleEvent(
  userId: string,
  googleEventId: string,
): Promise<void> {
  if (!googleEnabled()) return;
  const auth = await getAuthedClient(userId);
  if (!auth) return;

  try {
    const cal = google.calendar({ version: 'v3', auth });
    await cal.events.delete({ calendarId: 'primary', eventId: googleEventId });
  } catch (err: unknown) {
    // 410 Gone = already deleted on Google's side — not an error for us
    if ((err as { code?: number }).code === 410) return;
    logger.warn({ err, userId, googleEventId }, '[google] deleteGoogleEvent failed');
  }
}

/**
 * Map a raw Google Calendar API event to the shape expected by the client.
 */
export function mapGoogleEvent(e: calendar_v3.Schema$Event) {
  const allDay    = !e.start?.dateTime;
  const startDate = allDay
    ? new Date(`${e.start!.date}T00:00:00`)
    : new Date(e.start!.dateTime!);
  const endDate   = allDay
    ? new Date(`${e.end!.date}T00:00:00`)
    : new Date(e.end!.dateTime!);

  return {
    id:            e.id!,
    familyId:      '',          // not a FamilyApp DB event
    title:         e.summary ?? '(Sans titre)',
    description:   e.description ?? null,
    startDate,
    endDate,
    allDay,
    recurrence:    null,
    assignedTo:    [],
    createdBy:     null,
    googleEventId: e.id!,
    source:        'google' as const,
  };
}
