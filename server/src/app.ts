import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import routes from './routes/index.js';
import { errorHandler } from './middleware/error.middleware.js';
import { idAliasMiddleware } from './middleware/id-alias.middleware.js';
import { globalLimiter } from './middleware/rate-limit.middleware.js';
import { env } from './config/env.js';

// ESM-safe __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust the first reverse-proxy hop (Caddy) so rate-limiters and
// IP-based logic see the real client IP from X-Forwarded-For,
// not the Docker gateway address.
app.set('trust proxy', 1);

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Disable CSP for the SPA — it conflicts with inline scripts injected by Vite preview.
    contentSecurityPolicy: false,
  }),
);
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Alias Prisma's `id` → `_id` on every JSON response so the shared client
// types (which historically use `_id`) keep working. Must come before routes.
app.use(idAliasMiddleware);

// Serve uploaded files statically.
// In production the compiled file is at /app/server/dist/app.js, so uploads
// sit at /app/server/uploads (next to the compiled tree).
const uploadsDir = path.resolve(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// API routes — global rate-limiter applied first as a safety net.
// Per-route limiters (loginLimiter, authLimiter) add a stricter layer
// on top of this for sensitive endpoints.
app.use('/api/v1', globalLimiter, routes);

// Health check (used by Cloud Run / docker healthcheck)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Production: serve the built React client ─────────────────────
// In production, the compiled app file lives at /app/server/dist/app.js
// and the client static files are copied to /app/client by the Dockerfile.
// In development, the Vite dev server handles the client on port 5173,
// so this block is skipped.
if (env.NODE_ENV === 'production') {
  // Allow explicit override, otherwise derive from __dirname so we work
  // regardless of cwd: /app/server/dist/app.js → /app/client
  const clientDist =
    env.CLIENT_DIST_PATH ?? path.resolve(__dirname, '..', '..', 'client');

  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    console.log(`[app] Serving static client from ${clientDist}`);
    app.use(express.static(clientDist));
    // SPA fallback: serve index.html for any non-API route so React Router works.
    app.get(/^(?!\/(api|uploads|health)).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    console.warn(
      `[app] Client index.html not found at ${clientDist}; serving API only. ` +
        `Set CLIENT_DIST_PATH to override.`,
    );
  }
}

// Error handling (must be last)
app.use(errorHandler);

export default app;
