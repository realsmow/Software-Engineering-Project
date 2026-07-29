import { create } from "zustand";
import type { User, Role } from "@/types/domain";

/**
 * Global auth state
 * ใช้ Zustand เพราะ context re-render ทุก child เมื่อ user เปลี่ยน
 * ไม่ persist ไปที่ localStorage เพราะ token อยู่ใน httpOnly cookie
 */
interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  hasRole: (role: Role | Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    set({ user: null });
    // การ logout จริงต้องเรียก API เพื่อล้าง cookie
  },
  hasRole: (role) => {
    const user = get().user;
    if (!user) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(user.role);
  },
}));
