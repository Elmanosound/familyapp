import { Request, Response, NextFunction } from 'express';
import type { CookieOptions } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';
import { env } from '../config/env.js';

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
    // refreshToken is NOT returned in the body — it lives in the HttpOnly cookie
    res.status(201).json({ user: safeUser, accessToken });
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
    // refreshToken is NOT returned in the body — it lives in the HttpOnly cookie
    res.json({ user: safeUser, accessToken });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    // Read the refresh token from the HttpOnly cookie (not from the request body)
    const refreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
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

    // Only the short-lived access token is returned in the body
    res.json({ accessToken: newAccessToken });
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
