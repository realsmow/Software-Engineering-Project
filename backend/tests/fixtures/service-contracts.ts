import { z } from 'zod';
import {
  adminUserDetail,
  auditEventOutput,
  createUserOutput,
  cronJobOutput,
  lendingSettingsOutput,
  paginatedAdminUsers,
  paginatedAuditEvents,
  resetPasswordOutput,
  systemStatusOutput,
  technicalConfigOutput,
  userLoanHistory,
} from '../../src/admin/admin.schema';
import {
  availabilityOutput,
  deleteItemTypeOutput,
  deleteResourceOutput,
  eligibilityRule,
  itemDetail,
  itemTypeDetail,
  itemUnit,
  itemUnitOutput,
  paginatedItems,
  paginatedItemTypes,
  paginatedManagedRooms,
  paginatedRooms,
  roomAvailabilityOutput,
  roomOutput,
  roomSummary,
  retirementRequestOutput,
} from '../../src/item/item.schema';
import {
  createRequestOutput,
  paginatedRequests,
  requestOutput,
} from '../../src/loan/loan.schema';
import { okOutput } from '../../src/common/schemas/ok.schema';

export const adminContracts = {
  listUsers: paginatedAdminUsers,
  listUsersInScope: paginatedAdminUsers,
  getUserById: adminUserDetail,
  getUserLoans: userLoanHistory,
  createUser: createUserOutput,
  updateUser: adminUserDetail,
  changeRole: adminUserDetail,
  setUserActive: okOutput,
  resetPassword: resetPasswordOutput,
  getLendingSettings: lendingSettingsOutput,
  updateLendingSettings: lendingSettingsOutput,
  updateWorkHours: lendingSettingsOutput,
  getSystemStatus: systemStatusOutput,
  listCronJobs: z.array(cronJobOutput),
  runCronJob: okOutput,
  getConfig: technicalConfigOutput,
  listAudit: paginatedAuditEvents,
  getAuditById: auditEventOutput,
};

export const managementContracts = {
  listManagedItems: paginatedItemTypes,
  getManagedItemById: itemTypeDetail,
  createItemType: itemTypeDetail,
  updateItemType: itemTypeDetail,
  listManagedUnits: z.array(itemUnitOutput),
  createItemUnits: z.array(itemUnitOutput),
  updateItemUnit: itemUnitOutput,
  setUnitLendable: itemUnitOutput,
  setUnitCondition: itemUnitOutput,
  listManagedRooms: paginatedManagedRooms,
  createRoom: roomOutput,
  updateRoom: roomOutput,
  listEligibility: z.array(eligibilityRule),
  setEligibility: z.array(eligibilityRule),
  deleteItemType: deleteItemTypeOutput,
  deleteItemUnit: deleteResourceOutput,
  deleteRoom: deleteResourceOutput,
  requestRetirement: retirementRequestOutput,
  cancelRetirement: retirementRequestOutput,
};

export const catalogContracts = {
  list: paginatedItems,
  getById: itemDetail,
  getAvailability: availabilityOutput,
  listUnits: z.array(itemUnit),
  listRooms: paginatedRooms,
  getRoomById: roomSummary,
  roomAvailability: roomAvailabilityOutput,
};

export const requestContracts = {
  create: createRequestOutput,
  createRoomBooking: createRequestOutput,
  listMine: paginatedRequests,
  getMine: requestOutput,
  getAsDecider: requestOutput,
  confirmMyPickup: requestOutput,
  cancel: requestOutput,
};
