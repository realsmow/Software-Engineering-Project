import {
  test as base,
  expect,
  type Request,
  type Response,
} from "@playwright/test";
import { writeBusinessClock } from "./business-clock";
import {
  adminContracts,
  catalogContracts,
  managementContracts,
  requestContracts,
} from "../../../backend/tests/fixtures/service-contracts";
import {
  loginOutput,
  providersOutput,
} from "../../../backend/src/auth/auth.schema";
import { userOutput } from "../../../backend/src/common/schemas/user.schema";
import { okOutput } from "../../../backend/src/common/schemas/ok.schema";
import {
  paginatedNotifications,
  unreadCountOutput,
} from "../../../backend/src/notification/notification.schema";
import {
  approvalCounts,
  decideApprovalOutput,
  paginatedApprovalQueue,
  paginatedRetirementQueue,
  decideRetirementOutput,
} from "../../../backend/src/approval/approval.schema";
import {
  extensionOptionsOutput,
  extensionOutput,
  loanOutput,
  paginatedExtensionReviews,
  paginatedExtensions,
  paginatedStaffQueue,
  recordReturnOutput,
  staffQueueCounts,
} from "../../../backend/src/loan/loan.schema";
import {
  inspectionOutput,
  inspectionSubjectOutput,
  paginatedInspectionQueue,
  inspectionHistoryEntry,
  paginatedRoomCheckRounds,
  roomCheckOutput,
  paginatedRepairs,
  repairOutput,
} from "../../../backend/src/inspection/inspection.schema";
import { creditOutput } from "../../../backend/src/credit/credit.schema";
import {
  appealOutput,
  paginatedAppeals,
  appealablePenalty,
} from "../../../backend/src/appeal/appeal.schema";
import {
  requestUploadOutput,
  usagePhotosOutput,
} from "../../../backend/src/image/image.schema";
import {
  authorityRoleOptionOutput,
  managementGroupOptionOutput,
  tierOptionOutput,
} from "../../../backend/src/item/item.schema";
import { reportSummaryOutput } from "../../../backend/src/report/report.schema";

type OutputSchema = { parse(value: unknown): unknown };
const contracts: Record<string, OutputSchema> = {
  ...Object.fromEntries(
    Object.entries(adminContracts).map(([name, schema]) => [
      `admin.${name}`,
      schema,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(catalogContracts).map(([name, schema]) => [
      `item.${name}`,
      schema,
    ]),
  ),
  "auth.providers": providersOutput,
  "auth.login": loginOutput,
  "auth.me": userOutput,
  "auth.logout": okOutput,
  "auth.logoutAll": okOutput,
  "auth.register": okOutput,
  "auth.verifyEmail": okOutput,
  "auth.requestPasswordReset": okOutput,
  "auth.resetPasswordWithToken": okOutput,
  "item.listManaged": managementContracts.listManagedItems,
  "item.getManagedById": managementContracts.getManagedItemById,
  "item.createType": managementContracts.createItemType,
  "item.updateType": managementContracts.updateItemType,
  "item.listManagedUnits": managementContracts.listManagedUnits,
  "item.createUnit": managementContracts.createItemUnits,
  "item.updateUnit": managementContracts.updateItemUnit,
  "item.setUnitLendable": managementContracts.setUnitLendable,
  "item.setUnitCondition": managementContracts.setUnitCondition,
  "item.listManagedRooms": managementContracts.listManagedRooms,
  "item.createRoom": managementContracts.createRoom,
  "item.updateRoom": managementContracts.updateRoom,
  "item.deleteType": managementContracts.deleteItemType,
  "item.deleteUnit": managementContracts.deleteItemUnit,
  "item.deleteRoom": managementContracts.deleteRoom,
  "item.requestRetirement": managementContracts.requestRetirement,
  "item.cancelRetirement": managementContracts.cancelRetirement,
  "item.listEligibility": managementContracts.listEligibility,
  "item.setEligibility": managementContracts.setEligibility,
  "item.listTiers": tierOptionOutput.array(),
  "item.listManagementGroups": managementGroupOptionOutput.array(),
  "item.listAuthorityRoles": authorityRoleOptionOutput.array(),
  "loan.list": requestContracts.listMine,
  "loan.getById": requestContracts.getMine,
  "loan.create": requestContracts.create,
  "loan.createRoomBooking": requestContracts.createRoomBooking,
  "loan.cancel": requestContracts.cancel,
  "loan.confirmMyPickup": requestContracts.confirmMyPickup,
  "loan.staffQueue": paginatedStaffQueue,
  "loan.queueCounts": staffQueueCounts,
  "loan.getForStaff": loanOutput,
  "loan.allocate": loanOutput,
  "loan.swapUnit": loanOutput,
  "loan.confirmPickup": loanOutput,
  "loan.recordReturn": recordReturnOutput,
  "loan.markLost": loanOutput,
  "loan.extensionOptions": extensionOptionsOutput,
  "loan.requestExtension": extensionOutput,
  "loan.myExtensions": paginatedExtensions,
  "loan.cancelExtension": extensionOutput,
  "loan.extensionReviews": paginatedExtensionReviews,
  "loan.decideExtension": extensionOutput,
  "approval.queue": paginatedApprovalQueue,
  "approval.counts": approvalCounts,
  "approval.decide": decideApprovalOutput,
  "approval.retirementQueue": paginatedRetirementQueue,
  "approval.decideRetirement": decideRetirementOutput,
  "approval.extensionQueue": paginatedExtensionReviews,
  "approval.decideExtension": extensionOutput,
  "inspection.list": paginatedInspectionQueue,
  "inspection.getById": inspectionSubjectOutput,
  "inspection.create": inspectionOutput,
  "inspection.listForResource": inspectionHistoryEntry.array(),
  "inspection.listRoomRounds": paginatedRoomCheckRounds,
  "inspection.recordRoomCheck": roomCheckOutput,
  "inspection.listRepairs": paginatedRepairs,
  "inspection.startRepair": repairOutput,
  "inspection.finishRepair": repairOutput,
  "credit.me": creditOutput,
  "credit.getById": creditOutput,
  "appeal.appealable": appealablePenalty.array(),
  "appeal.mine": paginatedAppeals,
  "appeal.list": paginatedAppeals,
  "appeal.create": appealOutput,
  "appeal.getById": appealOutput,
  "appeal.decide": appealOutput,
  "image.requestUpload": requestUploadOutput,
  "image.requestUsagePhotoUpload": requestUploadOutput,
  "image.usagePhotos": usagePhotosOutput,
  "image.attachUsagePhotos": usagePhotosOutput,
  "image.detachUsagePhoto": usagePhotosOutput,
  "notification.list": paginatedNotifications,
  "notification.unreadCount": unreadCountOutput,
  "notification.markRead": okOutput,
  "notification.markAllRead": okOutput,
  "report.summary": reportSummaryOutput,
};

export async function validateApiResponse(
  response: Response,
  capturedBody?: unknown,
) {
  const procedures = new URL(response.url()).pathname
    .split("/trpc/")[1]
    ?.split(",");
  if (!procedures || !response.ok()) return;
  const body: unknown = capturedBody ?? (await response.json());
  const results = Array.isArray(body) ? body : [body];
  for (const [index, procedure] of procedures.entries()) {
    const envelope = results[index] as {
      error?: unknown;
      result?: { data?: unknown };
    };
    // Business errors are asserted by the individual scenarios. Only successful
    // output is required to satisfy the corresponding router's output schema.
    if (envelope?.error) continue;
    const schema = contracts[procedure];
    if (!schema) throw new Error(`Missing E2E output contract: ${procedure}`);
    try {
      schema.parse(envelope?.result?.data);
    } catch (error) {
      throw new Error(`Invalid ${procedure} response: ${String(error)}`);
    }
  }
}

export { expect };
export const test = base.extend<{ apiContractValidation: void }>({
  apiContractValidation: [
    async ({ page }, use) => {
      if (process.env.ULMS_TEST_NOW) {
        if (process.env.ULMS_TEST_CLOCK_FILE) {
          const clockFile = process.env.ULMS_TEST_CLOCK_FILE;
          await writeBusinessClock(clockFile, process.env.ULMS_TEST_NOW);
        }
        await page.clock.setFixedTime(new Date(process.env.ULMS_TEST_NOW));
      }
      const pending: Promise<void>[] = [];
      const failures: string[] = [];
      // Buffer live API bodies before navigation can discard Chromium's copy.
      // Scenario routes registered later still override this route; their
      // mocked responses are validated by the observer in the same way.
      const bodies = new WeakMap<Request, unknown>();
      await page.route("**/trpc/**", async (route) => {
        const response = await route.fetch();
        if (response.ok()) bodies.set(route.request(), await response.json());
        await route.fulfill({ response });
      });
      const observe = (response: Response) => {
        pending.push(
          validateApiResponse(response, bodies.get(response.request())).catch(
            (error: unknown) => {
              failures.push(String(error));
            },
          ),
        );
      };
      page.on("response", observe);
      try {
        await use();
      } finally {
        // Finish in-flight route.fetch reads before Playwright disposes its
        // request context, including requests started by final refetches.
        await page.unrouteAll({ behavior: "wait" });
        page.off("response", observe);
        await Promise.all(pending);
        expect(
          failures,
          "Every successful tRPC response must satisfy its backend contract",
        ).toEqual([]);
      }
    },
    { auto: true },
  ],
});
