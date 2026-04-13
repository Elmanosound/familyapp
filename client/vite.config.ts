import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import net from 'net';

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { resolve(false); });
    socket.connect(port, 'localhost');
  });
}

export default defineConfig(async () => {
  const backendUp = await isPortOpen(5000);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../shared/src'),
      },
    },
    server: {
      port: 5173,
      proxy: backendUp
        ? {
            '/api': {
              target: 'http://localhost:5000',
              changeOrigin: true,
            },
            '/uploads': {
              target: 'http://localhost:5000',
              changeOrigin: true,
            },
            '/socket.io': {
              target: 'http://localhost:5000',
              ws: true,
            },
          }
        : undefined,
    },
  };
});
