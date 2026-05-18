import { describe, it, expect } from 'vitest';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';

const USER_ID = 'user-test-abc123';

describe('JWT utilities', () => {
  // ── Access token ──────────────────────────────────────────────────────────

  describe('generateAccessToken / verifyAccessToken', () => {
    it('generates a well-formed JWT (3 segments)', () => {
      const token = generateAccessToken(USER_ID);
      expect(token.split('.')).toHaveLength(3);
    });

    it('encodes the userId in the payload', () => {
      const token = generateAccessToken(USER_ID);
      expect(verifyAccessToken(token).userId).toBe(USER_ID);
    });

    it('throws on a tampered token', () => {
      const token = generateAccessToken(USER_ID) + 'x';
      expect(() => verifyAccessToken(token)).toThrow();
    });

    it('throws on an empty string', () => {
      expect(() => verifyAccessToken('')).toThrow();
    });
  });

  // ── Refresh token ─────────────────────────────────────────────────────────

  describe('generateRefreshToken / verifyRefreshToken', () => {
    it('encodes the userId in the payload', () => {
      const token = generateRefreshToken(USER_ID);
      expect(verifyRefreshToken(token).userId).toBe(USER_ID);
    });

    it('throws on a tampered token', () => {
      const token = generateRefreshToken(USER_ID) + 'x';
      expect(() => verifyRefreshToken(token)).toThrow();
    });
  });

  // ── Cross-secret isolation ────────────────────────────────────────────────

  it('access token cannot be verified as a refresh token', () => {
    const token = generateAccessToken(USER_ID);
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it('refresh token cannot be verified as an access token', () => {
    const token = generateRefreshToken(USER_ID);
    expect(() => verifyAccessToken(token)).toThrow();
  });
});
