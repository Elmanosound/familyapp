import { Request, Response, NextFunction } from 'express';
import type { CookieOptions } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '../config/db.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { sendPasswordResetEmail } from '../utils/email.js';

// ── Refresh-token cookie options ──────────────────────────────────────────
//
// HttpOnly  → JS cannot read the token (mitigates XSS token theft)
// Secure    → HTTPS only in production (allows HTTP in dev)
// SameSite  → Strict prevents CSRF (cookie not sent on cross-site requests)
// path      → Scoped to /api/v1/auth so it is never sent to other routes
//
const REFRESH_COOKIE = 'refreshToken';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days — must match JWT_REFRESH_EXPIRES_IN
});

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, cookieOptions());
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

// The native mobile app (Capacitor) runs on a different origin (https://localhost)
// so the HttpOnly refresh cookie is cross-site and never sent. Such clients send
// `x-client-type: mobile`; for them we also return the refresh token in the body
// and accept it from the body on refresh. Browsers keep the cookie-only flow.
function isMobileClient(req: Request): boolean {
  return req.get('x-client-type') === 'mobile';
}

// ── Controllers ───────────────────────────────────────────────────────────

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ValidationError('Email already in use');

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, firstName, lastName, ...(phone && { phone }) },
    });

    const accessToken  = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    setRefreshCookie(res, refreshToken);

    const { password: _, refreshToken: __, resetPasswordToken: ___, ...safeUser } = user;
    // Browser: refreshToken stays in the HttpOnly cookie. Mobile: also in body.
    res.status(201).json({
      user: safeUser,
      accessToken,
      ...(isMobileClient(req) && { refreshToken }),
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const accessToken  = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    setRefreshCookie(res, refreshToken);

    const { password: _, refreshToken: __, resetPasswordToken: ___, ...safeUser } = user;
    // Browser: refreshToken stays in the HttpOnly cookie. Mobile: also in body.
    res.json({
      user: safeUser,
      accessToken,
      ...(isMobileClient(req) && { refreshToken }),
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    // Browser: read from the HttpOnly cookie. Mobile: fall back to the body,
    // since the cross-site cookie is not sent by the native WebView.
    const refreshToken =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ??
      (req.body?.refreshToken as string | undefined);
    if (!refreshToken) throw new UnauthorizedError('Refresh token required');

    const decoded = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user || user.refreshToken !== refreshToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Rotate both tokens on every refresh (prevents token reuse attacks)
    const newAccessToken  = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    setRefreshCookie(res, newRefreshToken);

    // Browser: only the access token in the body (refresh stays in the cookie).
    // Mobile: also return the rotated refresh token so it can be re-stored.
    res.json({
      accessToken: newAccessToken,
      ...(isMobileClient(req) && { refreshToken: newRefreshToken }),
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { refreshToken: null },
    });
    clearRefreshCookie(res);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response) {
  const { password, refreshToken, resetPasswordToken, ...safeUser } = req.user!;
  res.json({ user: safeUser });
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body as { email: string };

    // Always return 200 to avoid revealing whether the email exists
    const SAFE_RESPONSE = {
      message: 'Si ce compte existe, un email de réinitialisation a été envoyé.',
    };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.json(SAFE_RESPONSE);
      return;
    }

    // Generate a cryptographically-secure raw token and store its SHA-256 hash
    const rawToken    = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');
    const expiry      = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data:  { resetPasswordToken: hashedToken, resetPasswordExpires: expiry },
    });

    const resetLink = `${env.CLIENT_URL}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail(email, resetLink);

    res.json(SAFE_RESPONSE);
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = req.body as { token: string; password: string };

    const hashedToken = createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken:   hashedToken,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new ValidationError('Ce lien est invalide ou a expiré. Veuillez refaire la demande.');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password:             hashedPassword,
        resetPasswordToken:   null,
        resetPasswordExpires: null,
        // Invalidate all existing sessions for security
        refreshToken:         null,
      },
    });

    res.json({ message: 'Mot de passe mis à jour. Vous pouvez maintenant vous connecter.' });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { firstName, lastName, phone } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
      },
    });
    const { password, refreshToken, resetPasswordToken, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (error) {
    next(error);
  }
}
