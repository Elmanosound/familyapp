import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:    true,
    environment: 'node',
    setupFiles: ['src/__tests__/setup.ts'],
    silent:     true, // supprime les logs Pino pendant les tests

    // Variables d'environnement injectées avant le chargement de env.ts
    env: {
      NODE_ENV:            'test',
      JWT_SECRET:          'test-jwt-secret-min-32-characters-long-ok',
      JWT_REFRESH_SECRET:  'test-refresh-secret-min-32-chars-long-ok',
      DATABASE_URL:        'postgresql://test:test@localhost:5432/test',
      CLIENT_URL:          'http://localhost:5173',
      PORT:                '5001',
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include:  ['src/**/*.ts'],
      exclude:  ['src/index.ts', 'src/__tests__/**', 'src/**/*.d.ts'],
    },
  },
});
