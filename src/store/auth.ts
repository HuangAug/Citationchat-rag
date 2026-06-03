import { create } from "zustand";

import { apiFetch } from "@/lib/api";

export type User = { id: string; email: string; role: "user" | "admin" };

type LoginResponse = { accessToken: string; user: User };

type AuthState = {
  accessToken: string | null;
  user: User | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

function getStoredToken() {
  return localStorage.getItem("accessToken");
}

function setStoredToken(token: string | null) {
  if (token) localStorage.setItem("accessToken", token);
  else localStorage.removeItem("accessToken");
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  isHydrated: false,

  hydrate: async () => {
    const token = getStoredToken();
    if (!token) {
      set({ accessToken: null, user: null, isHydrated: true });
      return;
    }

    try {
      const user = await apiFetch<User>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ accessToken: token, user, isHydrated: true });
    } catch {
      setStoredToken(null);
      set({ accessToken: null, user: null, isHydrated: true });
    }
  },

  login: async (email, password) => {
    const res = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.accessToken);
    set({ accessToken: res.accessToken, user: res.user });
  },

  register: async (email, password) => {
    const res = await apiFetch<LoginResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.accessToken);
    set({ accessToken: res.accessToken, user: res.user });
  },

  logout: () => {
    setStoredToken(null);
    set({ accessToken: null, user: null });
  },
}));

