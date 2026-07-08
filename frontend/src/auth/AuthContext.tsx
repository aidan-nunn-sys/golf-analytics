import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiLogin, getToken, onUnauthorized, setToken } from "../api/client";
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
    queryFn: () => apiGet<User>("/auth/me"),
    enabled: hasToken,
    retry: false,
  });

  function logout() {
    setToken(null);
    qc.clear();
    setHasToken(false);
  }

  useEffect(() => {
    onUnauthorized(logout);
  }, []);

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
