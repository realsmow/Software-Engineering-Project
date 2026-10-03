import { create } from "zustand";
import type { User, Role } from "@/types/domain";
import { useRequestDraft } from "@/features/borrower/request/request-draft.store";

/**
 * Global auth state
 * ใช้ Zustand เพราะ context re-render ทุก child เมื่อ user เปลี่ยน
 *
 * The session itself lives in an httpOnly `ulms_session` cookie that this code
 * can neither read nor write - that is the point of httpOnly. So this store
 * holds only a *copy* of who the server said we are, populated by `auth.login`
 * or by the `auth.me` bootstrap in app.tsx. Clearing it does not end the
 * session; only the `auth.logout` mutation does.
 */
interface AuthState {
  user: User | null;
  /** True until the initial auth.me bootstrap resolves - guards route redirects. */
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  /** Clears the local copy. Call the auth.logout mutation first to drop the cookie. */
  logout: () => void;
  hasRole: (role: Role | Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  setUser: (user) => {
    // An expired session sets null first; the next sign-in may be someone else.
    if (user) useRequestDraft.getState().claim(user.id);
    set({ user, isLoading: false });
  },
  setLoading: (isLoading) => set({ isLoading }),

  // The draft is per person; the next user of this browser must not inherit it.
  logout: () => {
    useRequestDraft.getState().clear();
    set({ user: null });
  },

  hasRole: (role) => {
    const user = get().user;
    if (!user) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(user.role);
  },
}));
