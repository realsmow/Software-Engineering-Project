import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePickupImageUpload } from "../../src/features/borrower/pickup/use-pickup-image-upload";
import { useUploadInspectionPhoto } from "../../src/features/staff/inspection/use-inspection";
import { useUploadImage } from "../../src/features/staff/inventory/use-item-image";

/**
 * #238 / P-01: every upload path shrinks the photo first, then asks for a
 * ticket for the bytes it will really send - the ticket signs type and size,
 * so asking for the original's size and sending the smaller file would fail.
 */
const original = new File([new Uint8Array(4_000_000)], "IMG_1.jpg", { type: "image/jpeg" });
const resized = new File([new Uint8Array(300_000)], "IMG_1.jpg", { type: "image/jpeg" });

const api = vi.hoisted(() => ({
  usageTicket: vi.fn(),
  staffTicket: vi.fn(),
  attach: vi.fn(),
  upload: vi.fn(),
  resize: vi.fn(),
}));
vi.mock("../../src/lib/resize-image", () => ({ resizeForUpload: api.resize }));
vi.mock("../../src/lib/trpc", () => ({
  useTRPCClient: () => ({
    image: {
      requestUsagePhotoUpload: { mutate: api.usageTicket },
      requestUpload: { mutate: api.staffTicket },
      attachUsagePhotos: { mutate: api.attach },
    },
  }),
}));
vi.mock("../../src/lib/api-client", () => ({ apiClient: { uploadFile: api.upload } }));

const ticket = {
  uploadUrl: "http://localhost:3000/uploads/ticket",
  imageUrl: "/media/inspection/2026/10/x.jpg",
  previewUrl: "http://localhost:3000/media/inspection/2026/10/x.jpg",
  expiresAt: "2026-10-30T03:10:00.000Z",
  maxBytes: 5_000_000,
};
const clients: QueryClient[] = [];
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  clients.push(client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.resetAllMocks();
  api.resize.mockResolvedValue(resized);
  api.usageTicket.mockResolvedValue(ticket);
  api.staffTicket.mockResolvedValue(ticket);
  api.upload.mockResolvedValue(undefined);
  api.attach.mockResolvedValue({ before: [], after: [], inspection: [], evidence: [] });
});
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe("upload hooks resize before asking for a ticket (#238)", () => {
  it("borrower pickup and room photos", async () => {
    const { result } = renderHook(() => usePickupImageUpload(), { wrapper });
    await result.current.mutateAsync({
      usageKey: 42,
      stage: "before",
      image: { file: original, previewUrl: "blob:x", contentType: "image/jpeg", sizeBytes: original.size, status: "ready" },
    });
    expect(api.resize).toHaveBeenCalledWith(original);
    expect(api.usageTicket).toHaveBeenCalledWith({ usageKey: 42, contentType: "image/jpeg", sizeBytes: resized.size });
    expect(api.upload).toHaveBeenCalledWith(ticket.uploadUrl, resized);
  });

  it("staff inspection photos", async () => {
    const { result } = renderHook(() => useUploadInspectionPhoto(), { wrapper });
    await result.current.mutateAsync({ usageKey: 42, file: original });
    expect(api.usageTicket).toHaveBeenCalledWith({ usageKey: 42, contentType: "image/jpeg", sizeBytes: resized.size });
    expect(api.upload).toHaveBeenCalledWith(ticket.uploadUrl, resized);
  });

  it("staff tickets (extension check, catalogue images)", async () => {
    const { result } = renderHook(() => useUploadImage(), { wrapper });
    await result.current.mutateAsync({ file: original, purpose: "inspection" });
    expect(api.staffTicket).toHaveBeenCalledWith({ purpose: "inspection", contentType: "image/jpeg", sizeBytes: resized.size });
    expect(api.upload).toHaveBeenCalledWith(ticket.uploadUrl, resized);
  });
});
