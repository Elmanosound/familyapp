import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { makeOAuth2Client, getAuthedClient, googleEnabled } from '../services/googleCalendar.service.js';
import { updateGoogleEvent, deleteGoogleEvent, GoogleEventInput } from '../services/googleCalendar.service.js';
import { NotFoundError } from '../utils/errors.js';

// ── OAuth flow ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/google/auth-url
 * Returns the Google OAuth consent-screen URL as JSON.
 * The frontend must perform the redirect — a server-side redirect would lose
 * the Authorization: Bearer header that protects this endpoint.
 */
export function googleAuthUrl(req: Request, res: Response) {
  if (!googleEnabled()) {
    return res.status(501).json({ message: 'Google Calendar integration is not configured.' });
  }

  const auth = makeOAuth2Client();
  const url  = auth.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',    // force refresh_token every time
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: req.user!.id,       // passed back by Google in the callback
  });

  res.json({ url });
}

/**
 * GET /api/v1/google/callback
 * Google redirects here after the user grants (or denies) access.
 * No auth middleware — identity comes from the `state` query param.
 */
export async function googleAuthCallback(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { code, state: userId, error } = req.query as Record<string, string>;

  // User denied access or something went wrong on Google's side.
  if (error || !code || !userId) {
    return res.redirect(`${env.CLIENT_URL}/calendar?google=error`);
  }

  try {
    // Validate userId exists in our DB to prevent abuse.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return res.redirect(`${env.CLIENT_URL}/calendar?google=error`);

    // Exchange authorization code for tokens.
    const auth         = makeOAuth2Client();
    const { tokens }   = await auth.getToken(code);
    auth.setCredentials(tokens);

    // Fetch the Google account's email address.
    const oauth2      = google.oauth2({ version: 'v2', auth });
    const { data: gUser } = await oauth2.userinfo.get();

    await prisma.googleToken.upsert({
      where:  { userId },
      create: {
        userId,
        accessToken:  tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiresAt:    new Date(tokens.expiry_date ?? Date.now() + 3600_000),
        googleEmail:  gUser.email!,
      },
      update: {
        accessToken:  tokens.access_token!,
        // Google only returns refresh_token on the first grant; keep the old one otherwise.
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        expiresAt:    new Date(tokens.expiry_date ?? Date.now() + 3600_000),
        googleEmail:  gUser.email!,
      },
    });

    res.redirect(`${env.CLIENT_URL}/calendar?google=connected`);
  } catch (err) {
    next(err);
  }
}

// ── Status / Disconnect ───────────────────────────────────────────────────────

/**
 * GET /api/v1/google/status
 * Returns whether the current user has connected Google Calendar.
 */
export async function googleStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const token = await prisma.googleToken.findUnique({
      where:  { userId: req.user!.id },
      select: { googleEmail: true },
    });
    res.json({ connected: !!token, email: token?.googleEmail ?? null });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/google/disconnect
 * Removes the stored Google token for the current user.
 */
export async function googleDisconnect(req: Request, res: Response, next: NextFunction) {
  try {
    // Best-effort: revoke token with Google so it stops appearing in the
    // user's connected-apps list (ignore errors — token may already be gone).
    const token = await prisma.googleToken.findUnique({ where: { userId: req.user!.id } });
    if (token) {
      try {
        const auth = makeOAuth2Client();
        await auth.revokeToken(token.accessToken);
      } catch { /* ignore */ }
      await prisma.googleToken.delete({ where: { userId: req.user!.id } });
    }
    res.json({ message: 'Google Agenda déconnecté' });
  } catch (err) {
    next(err);
  }
}

// ── Google-sourced event CRUD ─────────────────────────────────────────────────
// These act directly on Google Calendar, bypassing the FamilyApp DB.

/**
 * PATCH /api/v1/google/events/:googleEventId
 * Update a Google Calendar event (not stored in FamilyApp DB).
 */
export async function updateGoogleSourceEvent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { googleEventId } = req.params;
    const { title, description, startDate, endDate, allDay } = req.body as {
      title: string;
      description?: string;
      startDate: string;
      endDate: string;
      allDay: boolean;
    };

    const auth = await getAuthedClient(req.user!.id);
    if (!auth) throw new NotFoundError('Google token');

    const input: GoogleEventInput = {
      title,
      description,
      startDate: new Date(startDate),
      endDate:   new Date(endDate),
      allDay:    !!allDay,
    };

    await updateGoogleEvent(req.user!.id, googleEventId as string, input);
    res.json({ message: 'Événement Google mis à jour' });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/google/events/:googleEventId
 * Delete a Google Calendar event (not stored in FamilyApp DB).
 */
export async function deleteGoogleSourceEvent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { googleEventId } = req.params;

    const auth = await getAuthedClient(req.user!.id);
    if (!auth) throw new NotFoundError('Google token');

    await deleteGoogleEvent(req.user!.id, googleEventId as string);
    res.json({ message: 'Événement Google supprimé' });
  } catch (err) {
    next(err);
  }
}
