import { createContext, useContext, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "./queryClient";
import type { User } from "@shared/schema";

type AuthUser = Pick<User, "id" | "fullName" | "email" | "role" | "companyName" | "verified" | "createdAt">;

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  requestMagicLink: (data: { email: string; fullName?: string; companyName?: string }) => Promise<{ message: string; email?: string; needsSignup?: boolean }>;
  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone: string;
    companyName: string;
    state: string;
    zipCode: string;
    role: "employer" | "broker";
  }) => Promise<{ message: string; email: string; verified?: boolean; pending?: boolean }>;
  verifyMagicLink: (token: string) => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.status === 401) return null;
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    staleTime: 60000,
    retry: false,
  });

  const requestMagicLink = useCallback(async (data: { email: string; fullName?: string; companyName?: string }) => {
    const res = await apiRequest("POST", "/api/auth/magic-link", data);
    return await res.json();
  }, []);

  const register = useCallback(async (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone: string;
    companyName: string;
    state: string;
    zipCode: string;
    role: "employer" | "broker";
  }) => {
    const res = await apiRequest("POST", "/api/auth/register", data);
    const result = await res.json();
    // result.pending = account awaiting Hunter's approval (do NOT prime auth)
    // result.verified = legacy auto-approved flow (kept for safety)
    if (result.verified) {
      await primeAuthMe();
      resetOtherCaches();
    }
    return result;
  }, []);

  const verifyMagicLink = useCallback(async (token: string) => {
    await apiRequest("POST", "/api/auth/verify-magic-link", { token });
    await primeAuthMe();
    resetOtherCaches();
  }, []);

  // Returns the user from the login response so callers can navigate
  // by role without waiting on a second /api/auth/me round-trip that
  // races the AuthProvider's own refetch.
  const login = useCallback(async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const user = (await res.json()) as AuthUser;
    // Seed the auth cache synchronously so every mounted useAuth()
    // reader sees the new user on the very next render. Do NOT call
    // queryClient.clear() first, that momentarily wipes the auth
    // entry and can flash the app into a logged-out state while
    // route guards re-evaluate. Clear *other* user-scoped caches
    // with a predicate that explicitly skips auth/me.
    queryClient.setQueryData(["/api/auth/me"], user);
    resetOtherCaches();
    return user;
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("POST", "/api/auth/logout");
    queryClient.setQueryData(["/api/auth/me"], null);
    resetOtherCaches();
  }, []);

  // Fetch /api/auth/me and write the result directly into the cache.
  // Used by register/magic-link transitions where the server sets the
  // session but doesn't return the user object in the same response.
  async function primeAuthMe() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      const user = res.ok ? ((await res.json()) as AuthUser) : null;
      queryClient.setQueryData(["/api/auth/me"], user);
    } catch {
      queryClient.setQueryData(["/api/auth/me"], null);
    }
  }

  // Drop every cached query EXCEPT /api/auth/me, so switching sessions
  // in the same tab doesn't leak the previous user's groups / admin
  // data / etc. into the new user's view. Using a predicate keeps the
  // freshly-seeded auth entry intact.
  function resetOtherCaches() {
    queryClient.removeQueries({
      predicate: (q) => {
        const key = q.queryKey?.[0];
        return typeof key !== "string" || key !== "/api/auth/me";
      },
    });
  }

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, requestMagicLink, register, verifyMagicLink, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
