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
} from '../../src/admin/admin.schema';
import {
  availabilityOutput,
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
  createUser: createUserOutput,
  updateUser: adminUserDetail,
  changeRole: adminUserDetail,
  setUserBan: okOutput,
  setUserActive: okOutput,
  resetPassword: resetPasswordOutput,
  getLendingSettings: lendingSettingsOutput,
  updateLendingSettings: lendingSettingsOutput,
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
