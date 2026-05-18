import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.middleware.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeReq = (body: unknown) => ({ body } as Request);

/** Returns a minimal Response mock and helpers to inspect calls. */
function makeRes() {
  const jsonFn   = vi.fn();
  const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
  const res      = { status: statusFn } as unknown as Response;
  return {
    res,
    statusCode: (): number | undefined => (statusFn.mock.calls[0] as [number] | undefined)?.[0],
    body:       (): unknown           => jsonFn.mock.calls[0]?.[0],
  };
}

// ── Test schema ───────────────────────────────────────────────────────────────

const TestSchema = z.object({
  email: z.string().email('Email invalide'),
  name:  z.string().min(1, 'Nom requis').max(50),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('validate middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn() as unknown as NextFunction;
  });

  it('calls next() when body is valid', () => {
    validate(TestSchema)(makeReq({ email: 'alice@example.com', name: 'Alice' }), makeRes().res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('replaces req.body with the coerced data', () => {
    const req = makeReq({ email: 'alice@example.com', name: 'Alice' });
    validate(TestSchema)(req, makeRes().res, next);
    expect(req.body).toEqual({ email: 'alice@example.com', name: 'Alice' });
  });

  it('strips unknown fields from req.body', () => {
    const req = makeReq({ email: 'alice@example.com', name: 'Alice', injected: 'evil' });
    validate(TestSchema)(req, makeRes().res, next);
    expect(req.body).not.toHaveProperty('injected');
  });

  it('returns 400 and does not call next() for invalid body', () => {
    const { res } = makeRes();
    validate(TestSchema)(makeReq({ email: 'not-an-email', name: '' }), res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns status 400 for invalid body', () => {
    const mock = makeRes();
    validate(TestSchema)(makeReq({ email: 'bad' }), mock.res, next);
    expect(mock.statusCode()).toBe(400);
  });

  it('includes field path and message in error details', () => {
    const mock = makeRes();
    validate(TestSchema)(makeReq({ email: 'bad', name: 'Alice' }), mock.res, next);
    const body = mock.body() as { error: string; details: { field: string; message: string }[] };
    expect(body.error).toBe('Données invalides');
    expect(body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email', message: 'Email invalide' }),
      ]),
    );
  });

  it('returns 400 when body is missing entirely', () => {
    const mock = makeRes();
    validate(TestSchema)(makeReq(undefined), mock.res, next);
    expect(mock.statusCode()).toBe(400);
  });
});
