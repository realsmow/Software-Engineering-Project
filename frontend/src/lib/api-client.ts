import type { ApiError } from "@/types/domain";

/**
 * Base API client สำหรับเรียก backend
 * - จัดการ token จาก httpOnly cookie อัตโนมัติ (credentials: include)
 * - แปลง error เป็น ApiError format ที่ frontend เข้าใจ
 * - สำหรับ tRPC จะมี wrapper แยกต่างหาก
 */

const API_URL = import.meta.env.VITE_API_URL || "/api";

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ApiClientError";
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...init } = options;

  const url = new URL(`${API_URL}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    ...init,
    credentials: "include", // ส่ง cookie ทุกครั้ง
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    let errorBody: ApiError;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = {
        code: "UNKNOWN_ERROR",
        message: `เกิดข้อผิดพลาด (${response.status})`,
      };
    }

    // 401 = ยังไม่ได้ login → redirect
    if (response.status === 401) {
      window.location.href = "/login";
    }

    throw new ApiClientError(response.status, errorBody);
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE" }),

  /**
   * Upload file ผ่าน pre-signed URL
   * flow: ขอ URL จาก backend → PUT ไปที่ URL ตรงๆ
   */
  uploadFile: async (
    uploadUrl: string,
    file: File,
    uploadHeaders: Record<string, string> = {},
  ): Promise<void> => {
    // The signer may require provider-specific headers (for example metadata
    // headers). Preserve them exactly and only supply Content-Type when the
    // backend did not already sign one.
    const headers = new Headers(uploadHeaders);
    if (!headers.has("Content-Type")) headers.set("Content-Type", file.type);

    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers,
    });
    if (!response.ok) {
      let body: { code?: string; message?: string; cause?: Record<string, unknown> } = {};
      try {
        body = (await response.json()) as typeof body;
      } catch {
        // A proxy or storage provider may return no JSON. Preserve the HTTP
        // status and fall back to the generic upload code in that case.
      }
      throw new ApiClientError(response.status, {
        code: body.code ?? "UPLOAD_REJECTED",
        message: body.message ?? `อัปโหลดไฟล์ล้มเหลว (${response.status})`,
        details: body.cause,
      });
    }
  },
};
