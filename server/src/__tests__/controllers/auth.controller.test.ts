import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// ── Module mocks — must be declared before any imports that use them ──────────

vi.mock('../../config/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      findFirst:  vi.fn(),
    },
  },
}));

vi.mock('../../utils/email.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (resolved after mocks are hoisted) ────────────────────────────────

import app from '../../app.js';
import { prisma } from '../../config/db.js';
import { sendPasswordResetEmail } from '../../utils/email.js';

// ── Factory ───────────────────────────────────────────────────────────────────

const mockUser = (overrides: Record<string, unknown> = {}) => ({
  id:                   'user-1',
  email:                'alice@example.com',
  password:             '$2a$10$hashedpassword',
  firstName:            'Alice',
  lastName:             'Dupont',
  phone:                null,
  avatarUrl:            null,
  role:                 'MEMBER',
  refreshToken:         null,
  resetPasswordToken:   null,
  resetPasswordExpires: null,
  familyId:             null,
  createdAt:            new Date(),
  updatedAt:            new Date(),
  ...overrides,
});

// ── Suites ────────────────────────────────────────────────────────────────────

describe('Auth API', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── POST /register ─────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('returns 201 with accessToken and safe user on success', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser() as any);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser() as any);

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'alice@example.com', password: 'password123', firstName: 'Alice', lastName: 'Dupont' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user).toMatchObject({ email: 'alice@example.com' });
      // Sensitive fields must never appear in the response
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('refreshToken');
      expect(res.body.user).not.toHaveProperty('resetPasswordToken');
    });

    it('returns 400 when email is already in use', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as any);

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'alice@example.com', password: 'password123', firstName: 'Alice', lastName: 'Dupont' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'alice@example.com' }); // no password, firstName, lastName

      expect(res.status).toBe(400);
    });

    it('returns 400 when password is shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'alice@example.com', password: 'short', firstName: 'Alice', lastName: 'Dupont' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /login ────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('returns 200 with accessToken and sets refresh cookie on success', async () => {
      const hashed = await bcrypt.hash('password123', 10);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser({ password: hashed }) as any);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser() as any);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'alice@example.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      // Refresh token must be in an HttpOnly cookie, not in the body
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('also returns refreshToken in the body for the native mobile client', async () => {
      const hashed = await bcrypt.hash('password123', 10);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser({ password: hashed }) as any);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser() as any);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('x-client-type', 'mobile')
        .send({ email: 'alice@example.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      // Mobile WebView can't use the cross-site cookie, so the token is in the body
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('returns 401 for an unknown email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'unknown@example.com', password: 'password123' });

      expect(res.status).toBe(401);
    });

    it('returns 401 for a wrong password', async () => {
      const hashed = await bcrypt.hash('correctpassword', 10);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser({ password: hashed }) as any);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'alice@example.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });
  });

  // ── POST /forgot-password ──────────────────────────────────────────────────

  describe('POST /api/v1/auth/forgot-password', () => {
    it('always returns 200 even when email does not exist (anti-enumeration)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('sends a reset email when the user exists', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as any);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser() as any);

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'alice@example.com' });

      expect(res.status).toBe(200);
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        'alice@example.com',
        expect.stringContaining('token='),
      );
    });

    it('returns 400 for an invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /reset-password ───────────────────────────────────────────────────

  describe('POST /api/v1/auth/reset-password', () => {
    it('returns 200 and clears sensitive fields on a valid token', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser() as any);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser() as any);

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'validtoken123', password: 'newpassword123' });

      expect(res.status).toBe(200);
      // Token + refresh session must be wiped after reset
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resetPasswordToken:   null,
            resetPasswordExpires: null,
            refreshToken:         null,
          }),
        }),
      );
    });

    it('returns 400 for an invalid or expired token', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'expiredtoken', password: 'newpassword123' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when the new password is too short', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'sometoken', password: 'short' });

      expect(res.status).toBe(400);
    });
  });
});
