import { createContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/authApi';
import type { User } from '../types/entryExit';

interface AuthContextValue {
  token: string | null;
  user: User | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'walkin-wrapper-token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState<boolean>(!!token);

  useEffect(() => {
    if (!token) {
      setInitializing(false);
      return;
    }

    authApi
      .me(token)
      .then((response) => {
        const resolvedUser = (response as { data?: User }).data ?? (response as User);
        setUser(resolvedUser);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setInitializing(false));
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      initializing,
      async login(email: string, password: string) {
        const response = await authApi.login({
          email,
          password,
          device_name: 'walkin-react-wrapper',
        });
        localStorage.setItem(TOKEN_KEY, response.access_token);
        setToken(response.access_token);
        setUser(response.user);
      },
      async logout() {
        if (token) {
          try {
            await authApi.logout(token);
          } catch {
            // Ignore logout failures so the local session can still be cleared.
          }
        }
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      },
    }),
    [initializing, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
