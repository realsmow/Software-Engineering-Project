import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuditEvents } from "../../src/features/admin/audit/use-audit-events";
import { paginatedAuditEvents } from "../../../backend/src/admin/admin.schema";

const listAuditMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({ admin: { listAudit: { query: listAuditMock } } }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("admin audit data hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAuditMock.mockResolvedValue(
      paginatedAuditEvents.strict().parse({
        items: [
          {
            id: 10,
            at: "2026-09-20T02:00:00.000Z",
            actorId: 7,
            actorName: "System admin",
            actorRole: "admin",
            action: "config",
            target: "system/config",
            ip: null,
            userAgent: null,
            detail: "Viewed technical configuration",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      })
    );
  });

  it("loads and adapts audit records through admin.listAudit", async () => {
    const result = renderHook(() => useAuditEvents(), { wrapper });

    await waitFor(() =>
      expect(result.result.current.data?.[0]?.target).toBe("system/config")
    );
    expect(listAuditMock).toHaveBeenCalledWith({ page: 1, pageSize: 100 });
  });
});
