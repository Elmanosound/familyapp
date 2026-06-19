import { Capacitor } from '@capacitor/core';

// True when the app runs inside the native Android/iOS WebView (Capacitor),
// false in a normal browser. Used to switch the auth strategy: on native the
// HttpOnly refresh-token cookie is cross-site (WebView origin is
// https://localhost) and not sent, so we store the refresh token ourselves.
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

const REFRESH_KEY = 'refreshToken';

// Refresh token persistence for native builds. In the browser this is never
// used — the refresh token stays in the HttpOnly cookie and never touches JS.
export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setStoredRefreshToken(token: string | null): void {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}
