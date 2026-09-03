import { QueryClient } from "@tanstack/react-query";
import { CACHE } from "@/constants";
import { ApiClientError } from "./api-client";

/**
 * Global QueryClient config
 * - staleTime default 30 วิ
 * - ไม่ retry ถ้าเป็น 4xx (user error)
 * - retry 3 ครั้งถ้าเป็น 5xx
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: CACHE.DEFAULT_STALE_MS,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiClientError && error.status < 500) {
          return false;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Query key factory
 * เก็บ key ทั้งหมดในที่เดียวเพื่อ invalidate ได้ถูกต้อง
 */
export const queryKeys = {
  // Auth
  me: ["me"] as const,

  // Equipment
  equipmentTypes: (filters?: Record<string, unknown>) =>
    ["equipment-types", filters] as const,
  equipmentType: (id: string) => ["equipment-types", id] as const,
  equipmentAvailability: (id: string) => ["equipment-types", id, "availability"] as const,
  equipmentUnits: (id: string) => ["equipment-types", id, "units"] as const,

  // Facility (T3)
  facilities: ["facilities"] as const,
  facilitySlots: (id: string, date: string) =>
    ["facilities", id, "slots", date] as const,

  // Loan requests
  myLoanRequests: (status?: string) => ["loan-requests", "me", status] as const,
  loanRequest: (id: string) => ["loan-requests", id] as const,

  // Loans
  myLoans: (status?: string) => ["loans", "me", status] as const,
  loan: (id: string) => ["loans", id] as const,

  // Credit
  myCredit: ["credit", "me"] as const,
  myDemerits: ["demerits", "me"] as const,

  // Notifications
  notifications: ["notifications"] as const,

  // Staff
  staffQueue: ["staff", "queue"] as const,

  // Supervisor
  supervisorQueue: ["supervisor", "queue"] as const,

  // Admin
  users: (filters?: Record<string, unknown>) => ["users", filters] as const,
  reports: (type: string) => ["reports", type] as const,

  // Master data (cache นาน)
  categories: ["categories"] as const,
  tiers: ["tiers"] as const,
  damageLevels: ["damage-levels"] as const,
} as const;
