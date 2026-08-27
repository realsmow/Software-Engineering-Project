import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { CACHE } from "@/constants";
import { useAuthStore } from "./auth.store";

/**
 * ดึงข้อมูล user ปัจจุบัน + sync เข้า Zustand store
 * ใช้เป็น "โปรไฟล์ต้นทาง" ทั้งแอป
 *
 * This is the session bootstrap: the browser can't read the httpOnly
 * `ulms_session` cookie, so the only way to find out whether we're signed in
 * is to ask the server. An UNAUTHORIZED answer is the normal "logged out"
 * case, not an error to surface.
 */
export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);

  const query = useQuery({
    ...trpc.auth.me.queryOptions(),
    staleTime: CACHE.USER_PROFILE_MS,
    // A 401 means "not signed in" — retrying can't change that.
    retry: false,
  });

  // Sync เข้า global store ทุกครั้งที่ data เปลี่ยน
  useEffect(() => {
    if (query.data) setUser(query.data);
    else if (query.isError) setUser(null);
  }, [query.data, query.isError, setUser]);

  return query;
}
