import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestUploadOutput,
  usagePhotosOutput,
  attachUsagePhotosInput,
} from "../../../backend/src/image/image.schema";
import { paginatedRequests } from "../../../backend/src/loan/loan.schema";
import i18n from "../../src/i18n";
import PickupPage from "../../src/features/borrower/pickup/pickup-page";
import RoomUsePage from "../../src/features/borrower/rooms/room-use-page";
import { requestResponse } from "../fixtures/api-responses";

const api = vi.hoisted(() => vi.fn<(path: string, input?: unknown) => unknown>());
const upload = vi.hoisted(() => vi.fn<(url: string, file: File) => Promise<void>>());
vi.mock("../../src/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/api-client")>();
  return { ...actual, apiClient: { ...actual.apiClient, uploadFile: upload } };
});
vi.mock("../../src/lib/trpc", () => {
  const client = new Proxy(
    {},
    {
      get: (_, domain: string) =>
        new Proxy(
          {},
          {
            get: (_, procedure: string) => {
              const call = (input?: unknown) =>
                Promise.resolve().then(() => api(`${domain}.${procedure}`, input));
              return { query: call, mutate: call };
            },
          }
        ),
    }
  );
  return { useTRPCClient: () => client };
});

let requests: ReturnType<typeof requestResponse>[];
let photos: ReturnType<typeof usagePhotosOutput.parse>;
const clients: QueryClient[] = [];
function renderPage(kind: "pickup" | "room") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/test"]}>
        <Routes>
          <Route
            path="/test"
            element={kind === "pickup" ? <PickupPage /> : <RoomUsePage />}
          />
          <Route path="/my/loans" element={<h1>My requests destination</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
function readyRoom() {
  const row = requestResponse({
    status: "ready",
    usageKey: 42,
    cancellable: false,
    startTime: "2026-09-28T01:00:00.000Z",
    endTime: "2026-09-28T02:00:00.000Z",
  });
  return requestResponse({
    ...row,
    resource: {
      ...row.resource,
      name: "Lab 7603",
      kind: "room",
      tier: "T3",
      serialNo: null,
    },
  });
}
function choosePhoto(container: HTMLElement, index = 0, type = "image/png") {
  const file = new File(["photo bytes"], "before.png", { type });
  fireEvent.change(container.querySelectorAll('input[type="file"]')[index], {
    target: { files: [file] },
  });
  return file;
}
beforeEach(() => {
  void i18n.changeLanguage("en");
  vi.clearAllMocks();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-photo");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  requests = [requestResponse({ status: "ready", usageKey: 42, cancellable: false })];
  photos = usagePhotosOutput.parse({
    before: [],
    after: [],
    inspection: [],
    evidence: [],
  });
  upload.mockResolvedValue(undefined);
  api.mockImplementation((path, input) => {
    switch (path) {
      case "item.list":
        return {
          items: [],
          total: 0,
          page: 1,
          pageSize: 100,
          nextCursor: null,
        };
      case "loan.list":
        return paginatedRequests.parse({
          items: requests,
          total: requests.length,
          page: 1,
          pageSize: 100,
        });
      case "image.usagePhotos":
        return photos;
      case "image.requestUsagePhotoUpload":
        return requestUploadOutput.parse({
          uploadUrl: "http://localhost:3000/uploads/ticket",
          imageUrl: "/media/before.png",
          previewUrl: "http://localhost:3000/media/before.png",
          expiresAt: "2026-09-28T01:10:00.000Z",
          maxBytes: 5_000_000,
        });
      case "image.attachUsagePhotos": {
        const value = attachUsagePhotosInput.parse(input);
        photos = usagePhotosOutput.parse({
          ...photos,
          [value.stage]: [
            {
              imageKey: 8,
              imageUrl: value.imageUrls[0],
              stage: value.stage,
              submittedBy: 7,
              submittedAt: "2026-09-28T01:00:00.000Z",
            },
          ],
        });
        return photos;
      }
      case "loan.confirmMyPickup": {
        requests = requests.map((row) => requestResponse({ ...row, status: "inUse" }));
        return requests[0];
      }
      case "loan.cancel":
        return requestResponse({
          ...requests[0],
          status: "cancelled",
          cancellable: false,
        });
      default:
        throw new Error(`Unexpected API procedure: ${path}`);
    }
  });
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

describe("borrower pickup page through its real API hooks", () => {
  it("requires a photo per selected item, uploads it before confirmation, and opens my requests", async () => {
    const { container } = renderPage("pickup");
    const confirm = await screen.findByRole("button", {
      name: i18n.t("borrower.pickup.confirm"),
    });
    expect(confirm).toBeDisabled();
    const file = choosePhoto(container);
    fireEvent.click(confirm);
    await screen.findByRole("heading", { name: "My requests destination" });
    expect(upload).toHaveBeenCalledWith("http://localhost:3000/uploads/ticket", file);
    const calls = api.mock.calls.map(([path]) => path);
    expect(calls.indexOf("image.attachUsagePhotos")).toBeLessThan(
      calls.indexOf("loan.confirmMyPickup")
    );
    expect(api).toHaveBeenCalledWith("loan.confirmMyPickup", { usageKey: 42 });
  });

  it("does not collect unchecked items or display room bookings in the equipment pickup list", async () => {
    requests.push(
      requestResponse({
        reservationKey: 30,
        status: "ready",
        usageKey: 43,
        resource: { ...requests[0].resource, name: "Second meter" },
      }),
      readyRoom()
    );
    const { container } = renderPage("pickup");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Second meter" }));
    expect(screen.queryByRole("checkbox", { name: "Lab 7603" })).not.toBeInTheDocument();
    choosePhoto(container);
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("borrower.pickup.confirm") })
    );
    await screen.findByRole("heading", { name: "My requests destination" });
    expect(api.mock.calls.filter(([path]) => path === "loan.confirmMyPickup")).toEqual([
      ["loan.confirmMyPickup", { usageKey: 42 }],
    ]);
  });

  it("rejects invalid file types and never confirms after an upload refusal", async () => {
    const { container } = renderPage("pickup");
    const confirm = await screen.findByRole("button", {
      name: i18n.t("borrower.pickup.confirm"),
    });
    choosePhoto(container, 0, "text/plain");
    expect(screen.getByText(i18n.t("borrower.pickup.photoBadType"))).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    choosePhoto(container);
    upload.mockRejectedValue(new Error("upload refused"));
    fireEvent.click(confirm);
    await waitFor(() => expect(upload).toHaveBeenCalled());
    await screen.findByText("upload refused");
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(api.mock.calls.some(([path]) => path === "loan.confirmMyPickup")).toBe(false);
  });

  it("shows the empty state and prevents collecting a request without a usage key", async () => {
    requests = [requestResponse({ status: "pending" })];
    const first = renderPage("pickup");
    await screen.findByText(i18n.t("borrower.pickup.none"));
    first.unmount();
    requests = [requestResponse({ status: "ready", usageKey: null })];
    const { container } = renderPage("pickup");
    const confirm = await screen.findByRole("button", {
      name: i18n.t("borrower.pickup.confirm"),
    });
    choosePhoto(container);
    expect(confirm).toBeDisabled();
  });
});

describe("room use page through its real API hooks", () => {
  it("gates check-in on stored before evidence and confirms the borrower endpoint", async () => {
    requests = [readyRoom()];
    const { container } = renderPage("room");
    const checkIn = await screen.findByRole("button", {
      name: i18n.t("borrower.roomUse.checkIn"),
    });
    expect(checkIn).toBeDisabled();
    choosePhoto(container);
    await waitFor(() => expect(checkIn).toBeEnabled());
    fireEvent.click(checkIn);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("loan.confirmMyPickup", {
        usageKey: 42,
      })
    );
    await screen.findByText(i18n.t("borrower.roomUse.stUsing"));
  });

  it("uploads after evidence during use and leaves closing the booking to staff", async () => {
    requests = [requestResponse({ ...readyRoom(), status: "inUse" })];
    const { container } = renderPage("room");
    await screen.findByText(i18n.t("borrower.roomUse.stUsing"));
    choosePhoto(container, 1);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("image.attachUsagePhotos", {
        usageKey: 42,
        stage: "after",
        imageUrls: ["/media/before.png"],
      })
    );
    expect(api.mock.calls.some(([path]) => path === "loan.recordReturn")).toBe(false);
    expect(screen.queryByRole("button", { name: /check.out/i })).not.toBeInTheDocument();
  });

  it("asks for cancellation confirmation and sends only a cancellable booking's reservation key", async () => {
    requests = [
      requestResponse({
        ...readyRoom(),
        status: "pending",
        usageKey: null,
        cancellable: true,
      }),
    ];
    renderPage("room");
    fireEvent.click(
      await screen.findByRole("button", {
        name: i18n.t("borrower.roomUse.cancel"),
      })
    );
    expect(api.mock.calls.some(([path]) => path === "loan.cancel")).toBe(false);
    fireEvent.click(
      screen.getByRole("button", {
        name: i18n.t("borrower.roomUse.cancelConfirmYes"),
      })
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("loan.cancel", { reservationKey: 29 })
    );
  });
});
