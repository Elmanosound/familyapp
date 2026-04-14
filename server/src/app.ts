import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import routes from './routes/index.js';
import { errorHandler } from './middleware/error.middleware.js';
import { env } from './config/env.js';

const app = express();

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Disable CSP for the SPA — it conflicts with inline scripts injected by Vite preview.
    contentSecurityPolicy: false,
  }),
);
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files statically
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// API routes
app.use('/api/v1', routes);

// Health check (used by Cloud Run / docker healthcheck)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Production: serve the built React client ─────────────────────
// In production, the client static files are bundled inside the same image
// at /app/client (built by the multi-stage Dockerfile). In development,
// the Vite dev server handles the client on port 5173.
if (env.NODE_ENV === 'production') {
  const clientDist = path.resolve(process.cwd(), 'client');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback: serve index.html for any non-API route so React Router works.
    app.get(/^(?!\/(api|uploads|health)).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    console.warn(`[app] Client dist not found at ${clientDist}; serving API only.`);
  }
}

// Error handling (must be last)
app.use(errorHandler);

export default app;
