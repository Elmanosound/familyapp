import pino from 'pino';

const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';

/**
 * Application-wide Pino logger.
 *
 * Production  → JSON on stdout, collected by Docker's json-file driver.
 *               Rotate via `logging.options` in docker-compose.yml.
 *
 * Development → pino-pretty transport for human-readable coloured output.
 *
 * Sensitive fields are always redacted before the log line is written,
 * so tokens and passwords never appear in log files.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),

  // Redact sensitive values wherever they appear in logged objects.
  // The paths follow the pino redact syntax (dot-notation, wildcards).
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.refreshToken',
    ],
    censor: '[REDACTED]',
  },

  // Pretty-print only in development — production stays as raw JSON.
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize:      true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore:        'pid,hostname',
        singleLine:    false,
      },
    },
  }),
});
