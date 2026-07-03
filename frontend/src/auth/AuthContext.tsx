import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiGet, apiLogin, getToken, onUnauthorized, setToken } from "../api/client";
import type { User } from "../api/types";

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  function logout() {
    setToken(null);
    setUser(null);
  }

  useEffect(() => {
    onUnauthorized(logout);
    if (!getToken()) {
      setLoading(false);
      return;
    }
    apiGet<User>("/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const token = await apiLogin(email, password);
    setToken(token.access_token);
    setUser(await apiGet<User>("/auth/me"));
  }

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
