import { vi, afterEach } from 'vitest';

// Reset all mocks between tests to prevent state leaking across test cases.
afterEach(() => {
  vi.clearAllMocks();
});
