import dotenv from 'dotenv';
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd   = NODE_ENV === 'production';

// ── Production secret guard ───────────────────────────────────────────────
//
// In production, JWT secrets MUST be explicit strong random values.
// A missing or default secret lets anyone forge valid tokens.
//
// Generate a suitable value with:
//   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
//
function requireSecret(envVar: string, devDefault: string): string {
  const value = process.env[envVar];

  if (!isProd) {
    // Development: allow the safe fallback so the server starts out of the box.
    return value ?? devDefault;
  }

  // Production: hard-stop on every misconfiguration.
  if (!value || value.trim().length === 0) {
    console.error(
      `\n[env] FATAL: ${envVar} is not set.\n` +
      `  Every JWT secret must be an explicit random value in production.\n` +
      `  Generate one:  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"\n`,
    );
    process.exit(1);
  }

  if (value === devDefault) {
    console.error(
      `\n[env] FATAL: ${envVar} is still set to the insecure development default.\n` +
      `  This value is public knowledge — rotate it immediately.\n`,
    );
    process.exit(1);
  }

  if (value.length < 32) {
    console.error(
      `\n[env] FATAL: ${envVar} is too short (${value.length} chars, minimum 32).\n` +
      `  A short secret is vulnerable to brute-force attacks.\n`,
    );
    process.exit(1);
  }

  return value;
}

export const env = {
  PORT:     parseInt(process.env.PORT || '5000', 10),
  NODE_ENV,
  DATABASE_URL:           process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/familyapp',
  JWT_SECRET:             requireSecret('JWT_SECRET',         'dev-jwt-secret'),
  JWT_REFRESH_SECRET:     requireSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
  JWT_EXPIRES_IN:         process.env.JWT_EXPIRES_IN         || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  CLOUDINARY_CLOUD_NAME:  process.env.CLOUDINARY_CLOUD_NAME  || '',
  CLOUDINARY_API_KEY:     process.env.CLOUDINARY_API_KEY     || '',
  CLOUDINARY_API_SECRET:  process.env.CLOUDINARY_API_SECRET  || '',
  SMTP_HOST:              process.env.SMTP_HOST               || '',
  SMTP_PORT:              parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER:              process.env.SMTP_USER               || '',
  SMTP_PASS:              process.env.SMTP_PASS               || '',
  CLIENT_URL:             process.env.CLIENT_URL              || 'http://localhost:5173',
  // Optional override for the built React client directory.
  // If unset, app.ts derives it from the compiled file location.
  CLIENT_DIST_PATH:       process.env.CLIENT_DIST_PATH || undefined,
};
