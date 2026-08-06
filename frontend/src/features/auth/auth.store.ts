import { create } from "zustand";
import type { User, Role } from "@/types/domain";
import { MOCK_USERS, MOCK_USER_STORAGE_KEY } from "./mock-auth";

/**
 * Global auth state
 * ใช้ Zustand เพราะ context re-render ทุก child เมื่อ user เปลี่ยน
 *
 * NOTE: No API is wired yet (brief note #5). Auth is mocked: `loginAs`
 * sets a mock user and persists the chosen role to localStorage, and
 * `hydrate` restores it on app start. When the real backend lands, the
 * httpOnly-cookie + `/auth/me` flow replaces the mock bits below.
 */
interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  /** Dev/mock login — sets a mock user for the given role and persists it. */
  loginAs: (role: Role) => void;
  /** Restore persisted mock user on app start; clears the loading flag. */
  hydrate: () => void;
  logout: () => void;
  hasRole: (role: Role | Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),

  loginAs: (role) => {
    const user = MOCK_USERS[role];
    try {
      window.localStorage.setItem(MOCK_USER_STORAGE_KEY, role);
    } catch {
      /* ignore storage errors */
    }
    set({ user, isLoading: false });
  },

  hydrate: () => {
    let role: string | null = null;
    try {
      role = window.localStorage.getItem(MOCK_USER_STORAGE_KEY);
    } catch {
      /* ignore storage errors */
    }
    const isRole = (r: string | null): r is Role =>
      r === "borrower" || r === "staff" || r === "supervisor" || r === "admin";
    set({ user: isRole(role) ? MOCK_USERS[role] : null, isLoading: false });
  },

  logout: () => {
    try {
      window.localStorage.removeItem(MOCK_USER_STORAGE_KEY);
    } catch {
      /* ignore storage errors */
    }
    set({ user: null });
  },

  hasRole: (role) => {
    const user = get().user;
    if (!user) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(user.role);
  },
}));
