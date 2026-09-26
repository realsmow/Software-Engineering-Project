import {
  itemSummary,
  itemUnit,
  roomSummary,
} from "../../../backend/src/item/item.schema";
import { creditOutput } from "../../../backend/src/credit/credit.schema";
import {
  extensionOutput,
  loanOutput,
  requestOutput,
} from "../../../backend/src/loan/loan.schema";
import { userOutput } from "../../../backend/src/common/schemas/user.schema";
import { inspectionOutput } from "../../../backend/src/inspection/inspection.schema";
import { notificationOutput } from "../../../backend/src/notification/notification.schema";

// Synthetic records validated with the server's real output schemas. They
// represent API contracts, not existing rows in a local or production DB.
export function itemResponse(
  changes: Partial<ReturnType<typeof itemSummary.parse>> = {}
) {
  return itemSummary.strict().parse({
    id: 11,
    name: "Multimeter",
    description: null,
    imageUrl: null,
    tier: "T1",
    creditWeight: 1,
    totalUnits: 4,
    availableUnits: 4,
    stockStatus: "ok",
    nextAvailableAt: null,
    prepDays: 0,
    allowBorrow: true,
    eligible: true,
    owner: null,
    ...changes,
  });
}

export function unitResponse(changes: Partial<ReturnType<typeof itemUnit.parse>> = {}) {
  return itemUnit.strict().parse({
    id: 1,
    resourceKey: 1,
    assetTag: "MM-001",
    imageUrl: null,
    status: "InStorage",
    allowBorrow: true,
    condition: "Normal",
    dueAt: null,
    nextAvailableAt: null,
    ...changes,
  });
}

export function requestResponse(
  changes: Partial<ReturnType<typeof requestOutput.parse>> = {}
) {
  return requestOutput.strict().parse({
    reservationKey: 29,
    status: "pending",
    resource: {
      resourceKey: 1,
      name: "Multimeter",
      serialNo: "MM-001",
      kind: "equipment",
      tier: "T1",
      creditWeight: 1,
    },
    startTime: "2026-09-28T01:00:00.000Z",
    endTime: "2026-09-29T09:00:00.000Z",
    reason: null,
    decisionNote: null,
    requestedAt: "2026-09-26T00:00:00.000Z",
    expiresAt: null,
    approval: {
      route: "supervisor",
      status: "Pending",
      approvedBy: null,
      autoApproved: false,
      approvedAt: null,
      resolvedAt: null,
    },
    usageKey: null,
    dueAt: null,
    cancellable: true,
    ...changes,
  });
}

export function creditResponse(
  changes: Partial<ReturnType<typeof creditOutput.parse>> = {}
) {
  return creditOutput.strict().parse({
    accountId: 7,
    score: 100,
    tier: "D0",
    maxBorrowDays: 14,
    maxExtendTimes: 2,
    activePenalties: [],
    totalDeducted: 0,
    ...changes,
  });
}

export function extensionResponse(
  changes: Partial<ReturnType<typeof extensionOutput.parse>> = {}
) {
  return extensionOutput.strict().parse({
    extensionKey: 99,
    usageKey: 7,
    status: "Pending",
    route: "supervisor",
    requiresInspection: true,
    autoApproved: false,
    extendNo: null,
    previousDueAt: "2026-09-28T09:07:06.947Z",
    requestedDueAt: "2026-09-30T09:07:06.947Z",
    dueAt: "2026-09-28T09:07:06.947Z",
    requestedAt: "2026-09-26T00:00:00.000Z",
    resolvedAt: null,
    itemName: "Oscilloscope 100MHz",
    serialNo: "EE-OSC-001",
    tier: "T2",
    extensionsUsed: 1,
    extensionsAllowed: 2,
    ...changes,
  });
}

export function loanResponse(changes: Partial<ReturnType<typeof loanOutput.parse>> = {}) {
  return loanOutput.strict().parse({
    usageKey: 42,
    reservationKey: 14,
    status: "Prepared",
    borrower: {
      accountKey: 7,
      studentId: "S12345",
      firstName: "Ada",
      lastName: "Lovelace",
      creditScore: 91,
    },
    itemName: "Multimeter",
    serialNo: "MM-001",
    resourceKey: 8,
    tier: "T1",
    checkoutCondition: "Normal",
    checkoutConditionNote: null,
    checkinCondition: null,
    checkoutAt: "2026-09-28T01:00:00.000Z",
    dueAt: "2026-09-29T09:00:00.000Z",
    returnedAt: null,
    overdueDays: 0,
    pendingExtensionKey: null,
    ...changes,
  });
}

export function roomResponse(
  changes: Partial<ReturnType<typeof roomSummary.parse>> = {}
) {
  return roomSummary.strict().parse({
    id: 7603,
    name: "Room 7603",
    description: null,
    location: "Engineering",
    capacity: 24,
    imageUrl: null,
    tier: "T3",
    creditWeight: 1,
    status: "InStorage",
    allowBorrow: true,
    bookable: true,
    owner: null,
    ...changes,
  });
}

export function userResponse(changes: Partial<ReturnType<typeof userOutput.parse>> = {}) {
  return userOutput.strict().parse({
    id: 7,
    studentId: "S12345",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.test",
    role: "borrower",
    facultyName: null,
    creditScore: 100,
    creditTier: "D0",
    maxBorrowDays: 14,
    maxExtendTimes: 2,
    ...changes,
  });
}

export function inspectionResponse(
  changes: Partial<ReturnType<typeof inspectionOutput.parse>> = {}
) {
  return inspectionOutput.strict().parse({
    inspectionKey: 13,
    usageKey: 42,
    resourceKey: 7,
    inspectorAccountKey: 99,
    level: "B0",
    condition: "Normal",
    note: null,
    inspectedAt: "2026-09-26T01:00:00.000Z",
    penalty: null,
    returnedToPool: true,
    ...changes,
  });
}

export function notificationResponse(
  changes: Partial<ReturnType<typeof notificationOutput.parse>> = {}
) {
  return notificationOutput.strict().parse({
    id: "77",
    userId: "42",
    type: "request_approved",
    title: "Request approved",
    body: "Laptop is ready for pickup",
    createdAt: "2026-09-25T10:00:00.000Z",
    linkTo: "/pickup",
    ...changes,
  });
}
