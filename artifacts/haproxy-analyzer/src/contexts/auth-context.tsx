import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, setToken, clearToken } from '@/lib/api-client';
import { setAuthTokenGetter } from '@workspace/api-client-react';

setAuthTokenGetter(() => {
  try { return localStorage.getItem('msb-token'); } catch { return null; }
});

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
  roleId: number;
  permissions: string[];
  colorTheme: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  refreshUser: async () => {},
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiGet<AuthUser>('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
      clearToken();
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('msb-token');
    if (!token) {
      setLoading(false);
      return;
    }
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await apiPost<{ token: string; user: AuthUser }>('/auth/login', { email, password });
    setToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  const hasPermission = (perm: string) => user?.permissions.includes(perm) ?? false;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
