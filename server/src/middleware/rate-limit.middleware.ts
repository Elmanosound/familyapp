import rateLimit from 'express-rate-limit';

// ── Helpers ────────────────────────────────────────────────────────────────

const jsonMessage = (msg: string) => ({
  status: 429,
  error: msg,
});

// ── Login — very strict ────────────────────────────────────────────────────
//
// 5 failed attempts per IP per 15 min.
// skipSuccessfulRequests: true → only wrong-password attempts are counted,
// so a legitimate user who logs in correctly is never penalised.
//
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: jsonMessage(
    'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
  ),
});

// ── Auth — moderate ────────────────────────────────────────────────────────
//
// 10 requests per IP per 15 min.
// Applied to /register and /refresh.
//
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Trop de requêtes. Réessayez dans 15 minutes.'),
});

// ── Global API — safety net ────────────────────────────────────────────────
//
// 200 requests per IP per 15 min — protects all /api/v1 routes from
// bulk scraping / DoS without affecting normal app usage.
//
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: jsonMessage('Trop de requêtes. Réessayez plus tard.'),
});
