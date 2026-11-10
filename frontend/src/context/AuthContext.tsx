// ===========================================================================
// Step 5: Admin Frontend UI - In-Memory Auth Context
// ===========================================================================

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiClient } from '../api/client';
import type { AuthUser, LoginResponse, MeResponse } from '../api/types';

interface AuthContextValue {
  user: AuthUser | null;
  csrfToken: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshAuth = useCallback(async () => {
    try {
      const data = await apiClient.get<MeResponse>('/auth/me');
      setUser(data.user);
      setCsrfToken(data.csrfToken);
      apiClient.setCsrfToken(data.csrfToken);
    } catch {
      setUser(null);
      setCsrfToken(null);
      apiClient.setCsrfToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Register unauthenticated handler on API client
    apiClient.setOnUnauthorized(() => {
      setUser(null);
      setCsrfToken(null);
      apiClient.setCsrfToken(null);
    });

    // Initial auth check on mount/refresh
    refreshAuth();
  }, [refreshAuth]);

  const login = async (username: string, password: string): Promise<void> => {
    const data = await apiClient.post<LoginResponse>('/auth/login', { username, password });
    setUser(data.user);
    setCsrfToken(data.csrfToken);
    apiClient.setCsrfToken(data.csrfToken);
  };

  const logout = async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Even if network or logout API fails, clear client session state
    } finally {
      setUser(null);
      setCsrfToken(null);
      apiClient.setCsrfToken(null);
      window.location.hash = '#/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        csrfToken,
        loading,
        login,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
