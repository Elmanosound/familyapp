import axios from 'axios';
import { isNative, getStoredRefreshToken, setStoredRefreshToken } from './platform';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
  // Required so the browser sends the HttpOnly refresh-token cookie on every
  // request (cross-origin in local dev where Vite runs on a different port).
  withCredentials: true,
});

// ── Inject access token on every request ─────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Tell the server this is the native app so it returns the refresh token in
  // the response body (the HttpOnly cookie can't be used cross-site here).
  if (isNative()) config.headers['x-client-type'] = 'mobile';
  return config;
});

// ── Auto-refresh on 401 ───────────────────────────────────────────────────
// The refresh token lives in an HttpOnly cookie — we do NOT read it from JS.
// The browser sends it automatically because withCredentials is true.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Web: the HttpOnly cookie carries the refresh token (empty body).
        // Native: the cookie is cross-site and not sent, so we pass the stored
        // refresh token in the body and tag the request as a mobile client.
        const native = isNative();
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          native ? { refreshToken: getStoredRefreshToken() } : {},
          {
            withCredentials: true,
            headers: native ? { 'x-client-type': 'mobile' } : undefined,
          },
        );

        localStorage.setItem('accessToken', data.accessToken);
        // The server rotates the refresh token on every refresh; on native we
        // must persist the new one or the next refresh will fail.
        if (native && data.refreshToken) setStoredRefreshToken(data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        if (isNative()) setStoredRefreshToken(null);
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
