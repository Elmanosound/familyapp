import '@testing-library/jest-dom';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Socket.io tries to connect on import — stub it globally
vi.mock('../config/socket', () => ({
  connectSocket:    vi.fn(),
  disconnectSocket: vi.fn(),
}));

// Stub localStorage (jsdom provides it but we want isolated control)
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem:    vi.fn(() => null),
    setItem:    vi.fn(),
    removeItem: vi.fn(),
    clear:      vi.fn(),
  },
  writable: true,
});
