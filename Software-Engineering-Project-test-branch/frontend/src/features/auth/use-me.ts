import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-client";
import { CACHE } from "@/constants";
import type { User } from "@/types/domain";
import { useAuthStore } from "./auth.store";

/**
 * ดึงข้อมูล user ปัจจุบัน + sync เข้า Zustand store
 * ใช้เป็น "โปรไฟล์ต้นทาง" ทั้งแอป
 */
export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);

  const query = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiClient.get<User>("/auth/me"),
    staleTime: CACHE.USER_PROFILE_MS,
    retry: false, // ถ้า 401 ให้ redirect (จัดการใน api-client)
  });

  // Sync เข้า global store ทุกครั้งที่ data เปลี่ยน
  useEffect(() => {
    if (query.data) setUser(query.data);
    else if (query.isError) setUser(null);
  }, [query.data, query.isError, setUser]);

  return query;
}
