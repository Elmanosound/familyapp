import type { CapacitorConfig } from '@capacitor/cli';

// FamilyApp — Android (Capacitor) configuration.
//
// The packaged app bundles the built web client (webDir: 'dist') and talks to
// the backend over the network. The backend URL is NOT set here — it is baked
// into the web bundle at build time via VITE_API_URL / VITE_SOCKET_URL
// (see client/.env.example).
//
// CAP_SERVER_URL is an optional DEV convenience: point the app at a running
// Vite dev server (e.g. http://192.168.1.20:5173) for live reload on a device.
// Leave it unset for a real/offline build.
const config: CapacitorConfig = {
  appId: 'com.familyapp.nas',
  appName: 'FamilyApp',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(process.env.CAP_SERVER_URL
      ? { url: process.env.CAP_SERVER_URL, cleartext: true }
      : {}),
  },
};

export default config;
