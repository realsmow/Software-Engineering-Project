import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishRepairInput,
  repairOutput,
  roomCheckRoundOutput,
  roomCheckOutput,
  paginatedRepairs,
  paginatedRoomCheckRounds,
} from "../../../backend/src/inspection/inspection.schema";
import {
  roomOutput,
  paginatedManagedRooms,
  paginatedItemTypes,
} from "../../../backend/src/item/item.schema";
import StaffRepairsPage from "../../src/features/staff/repairs/repairs-page";
import i18n from "../../src/i18n";
import { getErrorMessage } from "../../src/lib/error-messages";

const api = vi.hoisted(() => vi.fn<(path: string, input?: unknown) => unknown>());
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
const date = "2026-09-26T01:00:00.000Z";
const openRepair = repairOutput.strict().parse({
  repairKey: 8,
  resourceKey: 9,
  itemName: "Broken meter",
  serialNo: "MM-009",
  repairedByName: "Staff",
  conditionBefore: "Broken",
  conditionAfter: null,
  beganAt: date,
  finishedAt: null,
});
const room = roomOutput.strict().parse({
  resourceKey: 19,
  roomKey: 4,
  name: "Lab 7603",
  description: null,
  location: "Building 7",
  imageUrl: null,
  creditWeight: 0,
  capacity: 24,
  tier: "T3",
  status: "InStorage",
  lendable: false,
  condition: "Broken",
  managementGroup: { id: 3, name: "Engineering", type: "Faculty" },
  openMinutes: 420,
  closeMinutes: 1080,
  breakStartMinutes: null,
  breakEndMinutes: null,
});
let repairs: (typeof openRepair)[];
let rounds: ReturnType<typeof roomCheckRoundOutput.parse>[];
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StaffRepairsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  void i18n.changeLanguage("en");
  vi.clearAllMocks();
  repairs = [openRepair];
  rounds = [];
  api.mockImplementation((path, input) => {
    const envelope = { page: 1, pageSize: 100 };
    switch (path) {
      case "inspection.listRepairs":
        return paginatedRepairs.parse({
          ...envelope,
          items: repairs,
          total: repairs.length,
        });
      case "inspection.listRoomRounds":
        return paginatedRoomCheckRounds.parse({
          ...envelope,
          items: rounds,
          total: rounds.length,
        });
      case "inspection.listForResource":
        return [];
      case "item.listManaged":
        return paginatedItemTypes.parse({ ...envelope, items: [], total: 0 });
      case "item.listManagedRooms":
        return paginatedManagedRooms.parse({
          ...envelope,
          items: [room],
          total: 1,
        });
      case "inspection.startRepair":
        return repairOutput.parse({
          ...openRepair,
          repairKey: 10,
          resourceKey: 19,
          itemName: "Lab 7603",
          serialNo: null,
        });
      case "inspection.finishRepair": {
        const value = finishRepairInput.parse(input);
        return repairOutput.parse({
          ...openRepair,
          conditionAfter: value.condition,
          finishedAt: date,
        });
      }
      case "inspection.recordRoomCheck":
        return roomCheckOutput.parse({
          resourceKey: 19,
          conditionKey: 4,
          condition: "Broken",
          note: "Door broken",
          checkedAt: date,
          stillBookable: false,
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

describe("staff repair workshop with real hooks", () => {
  it.each(["Normal", "Broken"] as const)(
    "finishes a repair with %s and displays the server outcome",
    async (condition) => {
      const { container } = mount();
      fireEvent.click(await screen.findByRole("button", { name: /Broken meter/ }));
      const card = within(container.querySelector("section")!);
      fireEvent.click(
        card.getByRole("button", {
          name: i18n.t(`staff.inspection.cond${condition}`),
        })
      );
      fireEvent.change(
        card.getByPlaceholderText(i18n.t("staff.repairs.notePlaceholder")),
        { target: { value: " checked " } }
      );
      fireEvent.click(
        card.getByRole("button", {
          name: i18n.t("staff.repairs.finishAction"),
        })
      );
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith("inspection.finishRepair", {
          repairKey: 8,
          condition,
          note: "checked",
        })
      );
      await screen.findByText(
        i18n.t("staff.repairs.finishDone", {
          condition: i18n.t(`staff.inspection.cond${condition}`),
          outcome: i18n.t(
            condition === "Normal"
              ? "staff.repairs.closedBackInPool"
              : "staff.repairs.closedStillOut"
          ),
        })
      );
    }
  );

  it("starts repair on a room and refreshes the workshop", async () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.repairs.startNew") })
    );
    await screen.findByText("Lab 7603");
    fireEvent.change(
      screen.getByPlaceholderText(i18n.t("staff.repairs.startNotePlaceholder")),
      { target: { value: " Door broken " } }
    );
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.repairs.startAction") })
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("inspection.startRepair", {
        resourceKey: 19,
        note: "Door broken",
      })
    );
    await waitFor(() =>
      expect(
        screen.queryByText(i18n.t("staff.repairs.startTitle"))
      ).not.toBeInTheDocument()
    );
    expect(
      api.mock.calls.filter(([path]) => path === "inspection.listRepairs").length
    ).toBeGreaterThan(1);
  });

  it("prevents starting another repair on a resource already in the open list", async () => {
    repairs = [repairOutput.parse({ ...openRepair, resourceKey: 19 })];
    mount();
    await screen.findByRole("button", { name: /Broken meter/ });
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.repairs.startNew") })
    );
    await screen.findByText(i18n.t("staff.repairs.alreadyInRepair"));
    expect(
      screen.queryByRole("button", {
        name: i18n.t("staff.repairs.startAction"),
      })
    ).not.toBeInTheDocument();
  });

  it("records a room check and changes both queue filters to include history", async () => {
    rounds = [
      roomCheckRoundOutput.strict().parse({
        roundKey: 3,
        resourceKey: 19,
        roomName: "Lab 7603",
        location: "Building 7",
        openedAt: date,
        dueAt: date,
        closedAt: null,
        overdue: true,
        condition: null,
        note: null,
        stillBookable: false,
      }),
    ];
    mount();
    await screen.findByText("Lab 7603");
    fireEvent.click(
      screen.getByRole("button", {
        name: i18n.t("staff.inspection.condBroken"),
      })
    );
    fireEvent.change(
      screen.getByPlaceholderText(i18n.t("staff.repairs.roundNotePlaceholder")),
      { target: { value: "Door broken" } }
    );
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.repairs.roundSubmit") })
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("inspection.recordRoomCheck", {
        resourceKey: 19,
        condition: "Broken",
        note: "Door broken",
      })
    );
    fireEvent.click(screen.getByRole("tab", { name: i18n.t("staff.repairs.filterAll") }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("inspection.listRepairs", {
        page: 1,
        pageSize: 100,
        openOnly: false,
      })
    );
    expect(api).toHaveBeenCalledWith("inspection.listRoomRounds", {
      page: 1,
      pageSize: 100,
      openOnly: false,
    });
  });

  it("keeps a refused repair open and offers no finish action for closed repairs", async () => {
    const original = api.getMockImplementation()!;
    api.mockImplementation((path, input) => {
      if (path === "inspection.finishRepair") throw new Error("ALREADY_DECIDED");
      return original(path, input);
    });
    const first = mount();
    fireEvent.click(await screen.findByRole("button", { name: /Broken meter/ }));
    fireEvent.click(
      screen.getByRole("button", {
        name: i18n.t("staff.repairs.finishAction"),
      })
    );
    await waitFor(() =>
      expect(api.mock.calls.some(([path]) => path === "inspection.finishRepair")).toBe(
        true
      )
    );
    await screen.findByText(getErrorMessage(new Error("ALREADY_DECIDED")));
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: i18n.t("staff.repairs.finishAction"),
        })
      ).toBeEnabled()
    );
    first.unmount();
    repairs = [
      repairOutput.parse({
        ...openRepair,
        finishedAt: date,
        conditionAfter: "Normal",
      }),
    ];
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Broken meter/ }));
    expect(
      screen.queryByRole("button", {
        name: i18n.t("staff.repairs.finishAction"),
      })
    ).not.toBeInTheDocument();
  });
});
