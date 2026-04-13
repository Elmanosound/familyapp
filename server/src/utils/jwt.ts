import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export function generateAccessToken(userId: string): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as any };
  return jwt.sign({ userId }, env.JWT_SECRET, options);
}

export function generateRefreshToken(userId: string): string {
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as any };
  return jwt.sign({ userId }, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): { userId: string } {
  return jwt.verify(token, env.JWT_SECRET) as { userId: string };
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: string };
}
