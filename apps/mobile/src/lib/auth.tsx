import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, apiClient } from '@bharini/api-client';
import { readSession, setSessionStorage } from '@bharini/auth';
import type { AuthUser } from '@bharini/types';

import { registerForPush, unregisterForPush } from '@/lib/notifications';

// Tokens live in the OS keystore. Reads and writes are synchronous; deleting is async only, so a key is
// blanked first ('' reads as "no token") and then deleted.
setSessionStorage({
  getItem: (key) => SecureStore.getItem(key),
  setItem: (key, value) => SecureStore.setItem(key, value),
  removeItem: (key) => {
    SecureStore.setItem(key, '');
    void SecureStore.deleteItemAsync(key);
  },
});
// apiClient was created before the store above existed, so hand it the saved tokens now
apiClient.setSession(readSession());

type AuthState = {
  user: AuthUser | null;
  /** false until the saved session has been checked with the server */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads the account, e.g. after onboarding changes onboarding_complete. */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // with no saved token there is nothing to check, so the app is ready straight away
  const [ready, setReady] = useState(() => !readSession().accessToken);

  useEffect(() => {
    if (!readSession().accessToken) return;
    apiClient
      .me()
      .then((response) => setUser(response.data ?? null))
      .catch((error: unknown) => {
        // an expired or revoked session signs out; a network error just shows the login screen
        if (error instanceof ApiError && error.status === 401) apiClient.clearSession();
      })
      .finally(() => setReady(true));
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (userId) void registerForPush();
  }, [userId]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiClient.login({ email, password });
    const tokens = response.data?.tokens;
    if (!tokens?.access || !tokens.refresh || !response.data?.user) throw new Error(response.message || 'Login failed.');
    apiClient.setSession({ accessToken: tokens.access, refreshToken: tokens.refresh });
    setUser(response.data.user);
  }, []);

  const logout = useCallback(async () => {
    await unregisterForPush(); // while the session is still valid, so this phone stops getting the account's pushes
    await apiClient.logout().catch(() => undefined); // signing out locally must work even offline
    apiClient.clearSession();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const response = await apiClient.me();
    if (response.data) setUser(response.data);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout, refresh }), [user, ready, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
