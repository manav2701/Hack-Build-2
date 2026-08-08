'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, getToken } from '../lib/api';
import { User } from '../lib/types';

interface AuthState {
  user: User | null;
  /** True until the stored token has been checked, so the UI can avoid flashing "Sign in". */
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (email: string, password: string, name: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on boot. A token that the backend rejects (expired, or signed
  // with a rotated JWT_SECRET) is discarded rather than retried — otherwise every
  // request for the rest of the session carries a header that can only 401.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const data = await api<{ user: User }>('/v1/auth/me');
        if (!cancelled) setUser(data.user);
      } catch {
        setToken(null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback(async (path: string, json: unknown) => {
    const data = await api<{ token: string; user: User }>(path, { method: 'POST', json });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(
    (email: string, password: string) => authenticate('/v1/auth/login', { email, password }),
    [authenticate]
  );

  const signup = useCallback(
    (email: string, password: string, name: string) =>
      authenticate('/v1/auth/signup', { email, password, name }),
    [authenticate]
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    // Fire-and-forget: the token is stateless, so the local drop above IS the logout.
    api('/v1/auth/logout', { method: 'POST', json: {} }).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading, login, signup, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
