"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as api from "./api";
import type { User } from "./api";

interface AuthContextValue {
  /** Undefined while the stored token is still being validated. */
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const validate = api.getToken()
      ? api
          .getMe()
          .then(setUser)
          .catch(() => {
            // Expired or invalid token — clear it so we stop sending it.
            api.setToken(null);
            setUser(null);
          })
      : Promise.resolve();
    validate.finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password);
    api.setToken(result.token);
    setUser(result.user);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const result = await api.register(username, password);
    api.setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return context;
}
