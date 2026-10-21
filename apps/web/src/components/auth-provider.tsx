'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { apiClient } from '@bharini/api-client';
import { clearSession, readSession } from '@bharini/auth';
import type { AuthUser, TokenPair } from '@bharini/types';

export type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  loginWithSocialCode: (code: string) => Promise<AuthUser>;
  register: (payload: {
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    password: string;
    password_confirm: string;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hydrate: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const persistTokens = useCallback((tokens?: Partial<TokenPair> | null) => {
    if (!tokens?.access && !tokens?.refresh) {
      apiClient.clearSession();
      return;
    }

    apiClient.setSession({
      accessToken: tokens?.access ?? null,
      refreshToken: tokens?.refresh ?? null,
    });
  }, []);

  const hydrate = useCallback(async () => {
    setIsLoading(true);
    const session = readSession();
    apiClient.setSession({ accessToken: session.accessToken, refreshToken: session.refreshToken });

    if (!session.accessToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiClient.me();
      setUser(response.data ?? null);
    } catch {
      clearSession();
      apiClient.clearSession();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // restore the signed-in user after a page reload
  useEffect(() => {
    if (!readSession().accessToken) return;
    let cancelled = false;
    apiClient
      .me()
      .then((response) => {
        if (!cancelled) setUser(response.data ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSession = useCallback(async () => {
    const session = readSession();
    const refreshToken = session.refreshToken;

    if (!refreshToken) {
      throw new Error('No refresh token available.');
    }

    const response = await apiClient.refresh(refreshToken);
    const nextTokens = response.data ?? null;

    if (!nextTokens?.access) {
      throw new Error('Refresh token did not return a new access token.');
    }

    persistTokens({ access: nextTokens.access, refresh: nextTokens.refresh ?? refreshToken });

    if (user) {
      const refreshedUser = await apiClient.me();
      setUser(refreshedUser.data ?? user);
    }
  }, [persistTokens, user]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiClient.login({ email, password });
    const tokens = response.data?.tokens;
    const nextUser = response.data?.user ?? null;

    if (!tokens?.access || !tokens.refresh) {
      throw new Error(response.message || 'Login failed.');
    }

    persistTokens(tokens);
    setUser(nextUser);
    return nextUser as AuthUser;
  }, [persistTokens]);

  const loginWithSocialCode = useCallback(async (code: string) => {
    const response = await apiClient.exchangeSocialCode(code);
    const tokens = response.data?.tokens;
    if (!tokens?.access || !tokens.refresh) {
      throw new Error(response.message || 'Sign-in failed.');
    }
    persistTokens(tokens);
    setUser(response.data?.user ?? null);
    return response.data?.user as AuthUser;
  }, [persistTokens]);

  const register = useCallback(async (payload: {
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    password: string;
    password_confirm: string;
  }) => {
    const response = await apiClient.register(payload);
    const tokens = response.data?.tokens;
    const nextUser = response.data?.user ?? null;

    if (!tokens?.access || !tokens.refresh) {
      throw new Error(response.message || 'Registration failed.');
    }

    persistTokens(tokens);
    setUser(nextUser);
    return nextUser as AuthUser;
  }, [persistTokens]);

  const logout = useCallback(async () => {
    const session = readSession();

    try {
      if (session.refreshToken) {
        await apiClient.logout(session.refreshToken);
      }
    } finally {
      apiClient.clearSession();
      clearSession();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isAuthenticated: Boolean(user || readSession().accessToken),
    login,
    loginWithSocialCode,
    register,
    logout,
    refreshSession,
    hydrate,
  }), [hydrate, isLoading, login, loginWithSocialCode, logout, refreshSession, register, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
