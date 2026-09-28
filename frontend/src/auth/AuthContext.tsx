import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiLogin, getToken, onUnauthorized, setToken } from "../api/client";
import { ApiError } from "../api/client";
import { rememberUser, offlineUser, forgetUser } from "../offline/storage";
import { keys } from "../api/hooks";
import type { User } from "../api/types";

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [hasToken, setHasToken] = useState(() => !!getToken());

  // Sourcing `user` from the shared ["me"] query (instead of local state) means
  // any screen that updates the profile (Settings' useUpdateMe invalidates this
  // same key) is reflected everywhere without a page reload.
  const { data: user, isLoading } = useQuery({
    queryKey: keys.me,
    networkMode: "always",
    queryFn: async () => {
      const token = getToken();
      const cached = offlineUser(token);
      if (!navigator.onLine && cached) return cached;
      try {
        const profile = await apiGet<User>("/auth/me", AbortSignal.timeout(8000));
        if (token && token === getToken()) rememberUser(profile, token);
        return profile;
      } catch (error) {
        if (cached && (!(error instanceof ApiError) || error.status >= 500)) return cached;
        throw error;
      }
    },
    enabled: hasToken,
    retry: false,
  });

  const logout = useCallback(() => {
    forgetUser();
    setToken(null);
    qc.clear();
    setHasToken(false);
  }, [qc]);

  useEffect(() => onUnauthorized(logout), [logout]);

  async function login(email: string, password: string) {
    const token = await apiLogin(email, password);
    qc.clear(); // drop any previous user's cached data before switching identity
    setToken(token.access_token);
    setHasToken(true);
  }

  return (
    <AuthCtx.Provider value={{ user: user ?? null, loading: hasToken && isLoading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
