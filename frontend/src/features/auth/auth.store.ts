import { create } from "zustand";
import type { User, Role } from "@/types/domain";

/**
 * Global auth state
 * ใช้ Zustand เพราะ context re-render ทุก child เมื่อ user เปลี่ยน
 *
 * This store is a *cache of the server's answer*, not the source of truth.
 * The real session lives in the httpOnly `ulms_session` cookie, which
 * JavaScript cannot read — so `useMe()` asks the backend who we are and
 * writes the result here. Nothing in the app may put a user into this store
 * without the server having said so.
 */
interface AuthState {
  user: User | null;
  /** True until the first auth.me answer (success or failure) lands. */
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  /**
   * Clears local state only. Use the `useLogout()` hook instead for user
   * actions — the cookie also has to be cleared server-side.
   */
  clear: () => void;
  hasRole: (role: Role | Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),

  clear: () => set({ user: null, isLoading: false }),

  hasRole: (role) => {
    const user = get().user;
    if (!user) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(user.role);
  },
}));
